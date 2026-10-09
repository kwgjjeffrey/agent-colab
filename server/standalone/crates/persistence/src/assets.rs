//! Source identity is supplied only by the authenticated contributor Core, never guessed from names.
use crate::Database;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterAsset {
    pub kind: String,
    pub name: String,
    pub description: Option<String>,
    pub source_adapter: String,
    pub source_key: String,
    #[serde(default)]
    pub existing_share_ids: Vec<Uuid>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;
    #[tokio::test]
    #[ignore = "requires an isolated fully migrated COLAB_ASSET_TEST_DATABASE_URL"]
    async fn one_publication_many_authorized_references() -> anyhow::Result<()> {
        let url = std::env::var("COLAB_ASSET_TEST_DATABASE_URL")?;
        let db = Database {
            pool: sqlx::postgres::PgPoolOptions::new()
                .max_connections(8)
                .connect(&url)
                .await?,
        };
        let user = Uuid::new_v4();
        let outsider = Uuid::new_v4();
        let member_b = Uuid::new_v4();
        for id in [user, outsider, member_b] {
            sqlx::query("insert into users(id,email) values($1,$2)")
                .bind(id)
                .bind(format!("{id}@asset-test.invalid"))
                .execute(&db.pool)
                .await?;
        }
        let org = db.create_organization(user, "Asset tests").await?;
        let a = db.create_channel(user, org.id, "A", None).await?;
        let b = db.create_channel(user, org.id, "B", None).await?;
        let member_id = Uuid::new_v4();
        sqlx::query("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$3,'member')").bind(member_id).bind(org.id).bind(member_b).execute(&db.pool).await?;
        sqlx::query("insert into channel_members(channel_id,organization_id,organization_member_id,role) values($1,$2,$3,'member')").bind(b.id).bind(org.id).bind(member_id).execute(&db.pool).await?;
        for kind in ["files", "skill", "session"] {
            let request = RegisterAsset {
                kind: kind.into(),
                name: format!("{kind} source"),
                description: None,
                source_adapter: if kind == "session" {
                    "codex-jsonl-v1"
                } else {
                    "shadow-git-v1"
                }
                .into(),
                source_key: hex::encode(sha2::Sha256::digest(kind.as_bytes())),
                existing_share_ids: vec![],
            };
            let first = db.register_asset(user, a.id, &request).await?.unwrap();
            let second = db.register_asset(user, b.id, &request).await?.unwrap();
            assert_eq!(first.asset_id, second.asset_id);
            assert_eq!(first.publication_id, second.publication_id);
            assert_ne!(first.reference_id, second.reference_id);
            assert_eq!(second.reference_count, 2);
            let again = db.register_asset(user, b.id, &request).await?.unwrap();
            assert_eq!(again.reference_id, second.reference_id);
            assert!(db.register_asset(outsider, a.id, &request).await?.is_none());
            assert!(
                db.asset_binding(outsider, second.reference_id)
                    .await?
                    .is_none()
            );
            assert!(
                db.asset_binding(member_b, first.reference_id)
                    .await?
                    .is_none()
            );
            assert!(
                db.asset_binding(member_b, second.reference_id)
                    .await?
                    .is_some()
            );
            if kind == "session" {
                let (snapshot, _) = db
                    .append_session_segment(
                        user,
                        first.reference_id,
                        None,
                        false,
                        "{}",
                        "session-test-blob",
                        "digest",
                        10,
                    )
                    .await?
                    .unwrap();
                let chain = db
                    .session_snapshot_chain(user, second.reference_id)
                    .await?
                    .unwrap();
                assert_eq!(chain.len(), 1);
                assert_eq!(chain[0].0.id, snapshot.id);
                assert_eq!(
                    db.session_snapshot_chain(member_b, second.reference_id)
                        .await?
                        .unwrap()[0]
                        .0
                        .id,
                    snapshot.id
                );
                assert!(
                    db.session_snapshot_chain(member_b, first.reference_id)
                        .await?
                        .is_none()
                );
            } else {
                let revision = db
                    .create_git_revision(
                        user,
                        first.reference_id,
                        kind,
                        "first-root",
                        None,
                        &format!("{kind}-test-blob"),
                        10,
                    )
                    .await?
                    .unwrap();
                let revisions = db
                    .list_git_revisions(user, second.reference_id, kind)
                    .await?
                    .unwrap();
                assert_eq!(revisions.len(), 1);
                assert_eq!(revisions[0].id, revision.id);
                assert_eq!(
                    db.list_git_revisions(member_b, second.reference_id, kind)
                        .await?
                        .unwrap()[0]
                        .id,
                    revision.id
                );
                assert!(
                    db.list_git_revisions(member_b, first.reference_id, kind)
                        .await?
                        .is_none()
                );
            }
            sqlx::query("update channel_shares set state='withdrawn' where id=$1")
                .bind(first.reference_id)
                .execute(&db.pool)
                .await?;
            assert!(db.asset_can_read(user, first.publication_id, kind).await?);
            assert_eq!(
                db.asset_publication(user, second.reference_id, kind)
                    .await?,
                Some(first.publication_id)
            );
            assert_eq!(
                db.asset_binding(user, second.reference_id)
                    .await?
                    .unwrap()
                    .reference_count,
                1
            );
            assert!(
                db.referenced_blob_keys()
                    .await?
                    .iter()
                    .any(|key| key == &format!("{kind}-test-blob"))
            );
            sqlx::query("update channel_shares set state='withdrawn' where id=$1")
                .bind(second.reference_id)
                .execute(&db.pool)
                .await?;
            assert!(
                db.asset_publication(user, second.reference_id, kind)
                    .await?
                    .is_none()
            );
            assert!(!db.asset_can_read(user, second.reference_id, kind).await?);
            sqlx::query(
                "update shared_assets set retained_until=now()-interval '1 second' where id=$1",
            )
            .bind(first.asset_id)
            .execute(&db.pool)
            .await?;
            assert!(db.reclaim_expired_assets().await? >= 1);
            let restored = db.register_asset(user, b.id, &request).await?.unwrap();
            assert_eq!(restored.asset_id, first.asset_id);
            assert!(restored.current_root_oid.is_none());
            assert!(restored.current_snapshot_id.is_none());
        }
        let concurrent = RegisterAsset {
            kind: "files".into(),
            name: "Concurrent source".into(),
            description: None,
            source_adapter: "shadow-git-v1".into(),
            source_key: Uuid::new_v4().simple().to_string().repeat(2),
            existing_share_ids: vec![],
        };
        let (one, two) = tokio::join!(
            db.register_asset(user, a.id, &concurrent),
            db.register_asset(user, b.id, &concurrent)
        );
        let one = one?.unwrap();
        let two = two?.unwrap();
        assert_eq!(one.asset_id, two.asset_id);
        assert_eq!(
            db.asset_binding(user, one.reference_id)
                .await?
                .unwrap()
                .reference_count,
            2
        );
        let old_a = db.create_file_share(user, a.id, "Legacy A").await?.unwrap();
        let old_b = db.create_file_share(user, b.id, "Legacy B").await?.unwrap();
        let old_same_channel=db.create_file_share(user,a.id,"Legacy duplicate placement").await?.unwrap();
        db.create_git_revision(
            user,
            old_a.id,
            "files",
            "legacy-root",
            None,
            "legacy-asset-blob",
            10,
        )
        .await?
        .unwrap();
        let migration = RegisterAsset {
            kind: "files".into(),
            name: "Legacy A".into(),
            description: None,
            source_adapter: "shadow-git-v1".into(),
            source_key: Uuid::new_v4().simple().to_string().repeat(2),
            existing_share_ids: vec![old_a.id, old_b.id,old_same_channel.id],
        };
        let merged = db.register_asset(user, a.id, &migration).await?.unwrap();
        assert_eq!(merged.reference_id, old_a.id);
        assert_eq!(merged.publication_id, old_a.id);
        assert_eq!(db.list_file_revisions(user,old_same_channel.id).await?.unwrap().len(),1);
        assert!(db.asset_can_read(user,old_same_channel.id,"files").await?);
        assert_eq!(
            db.asset_binding(user, old_b.id).await?.unwrap().asset_id,
            merged.asset_id
        );
        assert_eq!(
            db.list_file_revisions(member_b, old_b.id)
                .await?
                .unwrap()
                .len(),
            1
        );
        Ok(())
    }
}
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetBinding {
    pub reference_id: Uuid,
    pub asset_id: Uuid,
    pub publication_id: Uuid,
    pub current_root_oid: Option<String>,
    pub current_snapshot_id: Option<Uuid>,
    pub reference_count: i64,
}
impl Database {
    pub(crate) async fn withdraw_asset_reference(&self, user: Uuid, reference: Uuid, kind: &str) -> anyhow::Result<bool> {
        let mut tx = self.pool.begin().await?;
        // Publication also locks the asset before projecting reference rows. Keep that order
        // during withdrawal so its retention trigger cannot deadlock with an active upload.
        let asset: Option<Uuid> = sqlx::query_scalar("select a.id from shared_assets a join channel_shares s on s.asset_id=a.id where s.id=$1 and a.owner_user_id=$2 and s.kind=$3 and s.state='active' for update of a")
            .bind(reference).bind(user).bind(kind).fetch_optional(&mut *tx).await?;
        if asset.is_none() { return Ok(false); }
        let changed = sqlx::query("update channel_shares set state='withdrawn',updated_at=now() where id=$1 and state='active'")
            .bind(reference).execute(&mut *tx).await?.rows_affected() == 1;
        tx.commit().await?;
        Ok(changed)
    }
    pub async fn register_asset(
        &self,
        user: Uuid,
        channel: Uuid,
        body: &RegisterAsset,
    ) -> anyhow::Result<Option<AssetBinding>> {
        let mut tx = self.pool.begin().await?;
        let member:Option<Uuid>=sqlx::query_scalar("select cm.organization_member_id from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2").bind(channel).bind(user).fetch_optional(&mut *tx).await?;
        let Some(member) = member else {
            return Ok(None);
        };
        // Legacy merges can touch several keys; serialize registration per owner before row locks.
        sqlx::query("select pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("asset-registration:{user}"))
            .execute(&mut *tx)
            .await?;
        let mut asset:Option<Uuid>=sqlx::query_scalar("select id from shared_assets where owner_user_id=$1 and kind=$2 and source_key=$3 and source_adapter=$4 for update").bind(user).bind(&body.kind).bind(&body.source_key).bind(&body.source_adapter).fetch_optional(&mut *tx).await?;
        // Ordered candidates are proven equal canonical local sources; prefer the most advanced publisher.
        let mut candidates = Vec::new();
        for id in &body.existing_share_ids {
            let candidate:Option<Uuid>=sqlx::query_scalar("select a.id from channel_shares s join shared_assets a on a.id=s.asset_id where s.id=$1 and a.owner_user_id=$2 and a.kind=$3 and a.source_adapter=$4").bind(id).bind(user).bind(&body.kind).bind(&body.source_adapter).fetch_optional(&mut *tx).await?;
            let Some(candidate) = candidate else {
                anyhow::bail!("asset_source_candidate_forbidden")
            };
            if !candidates.contains(&candidate) {
                candidates.push(candidate);
            }
        }
        if asset.is_none() {
            asset = candidates.first().copied();
        }
        let asset = asset.unwrap_or_else(Uuid::new_v4);
        sqlx::query("select id from shared_assets where id=any($1) order by id for update")
            .bind(&candidates)
            .fetch_all(&mut *tx)
            .await?;
        if candidates.contains(&asset) {
            let changed=sqlx::query("update shared_assets set source_key=$2 where id=$1 and (source_key is null or source_key=$2)").bind(asset).bind(&body.source_key).execute(&mut *tx).await?;
            if changed.rows_affected() != 1 {
                anyhow::bail!("asset_source_identity_conflict");
            }
        }
        let exists: bool =
            sqlx::query_scalar("select exists(select 1 from shared_assets where id=$1)")
                .bind(asset)
                .fetch_one(&mut *tx)
                .await?;
        if !exists {
            sqlx::query("insert into shared_assets(id,owner_user_id,kind,name,description,source_adapter,source_key,publication_share_id) values($1,$2,$3,$4,$5,$6,$7,$1)").bind(asset).bind(user).bind(&body.kind).bind(&body.name).bind(&body.description).bind(&body.source_adapter).bind(&body.source_key).execute(&mut *tx).await?;
        }
        for candidate in candidates.iter().filter(|id| **id != asset) {
            // Historical references remain authorized under their original IDs, including
            // multiple old placements in one Channel. Only their shared publication changes.
            sqlx::query("update channel_shares s set asset_id=a.id,name=a.name,description=a.description,source_adapter=a.source_adapter,current_root_oid=a.current_root_oid,current_snapshot_id=a.current_snapshot_id,updated_at=now() from shared_assets a where s.asset_id=$1 and a.id=$2").bind(candidate).bind(asset).execute(&mut *tx).await?;
            // A retired publication anchor now points at the canonical asset. It must not
            // remain discoverable as an independent source on later registration.
            sqlx::query("update shared_assets set source_key=null where id=$1").bind(candidate).execute(&mut *tx).await?;
        }
        let reference: Option<Uuid> = sqlx::query_scalar(
            "select id from channel_shares where asset_id=$1 and channel_id=$2 and state='active' order by created_at,id limit 1",
        )
        .bind(asset)
        .bind(channel)
        .fetch_optional(&mut *tx)
        .await?;
        let reference = if let Some(id) = reference {
            id
        } else {
            let id = if !exists { asset } else { Uuid::new_v4() };
            sqlx::query("insert into channel_shares(id,asset_id,channel_id,contributor_member_id,name,kind,source_adapter) values($1,$2,$3,$4,$5,$6,$7)").bind(id).bind(asset).bind(channel).bind(member).bind(&body.name).bind(&body.kind).bind(&body.source_adapter).execute(&mut *tx).await?;
            id
        };
        let result=sqlx::query_as::<_,AssetBinding>("select $1::uuid reference_id,a.id asset_id,a.publication_share_id publication_id,a.current_root_oid,a.current_snapshot_id,(select count(*) from channel_shares s where s.asset_id=a.id and s.state='active') reference_count from shared_assets a where a.id=$2").bind(reference).bind(asset).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(result))
    }
    pub async fn asset_binding(
        &self,
        user: Uuid,
        reference: Uuid,
    ) -> anyhow::Result<Option<AssetBinding>> {
        // Owners may inspect a withdrawn anchor for background publication; consumers require the exact active reference.
        sqlx::query_as("select s.id reference_id,a.id asset_id,a.publication_share_id publication_id,a.current_root_oid,a.current_snapshot_id,(select count(*) from channel_shares r where r.asset_id=a.id and r.state='active') reference_count from channel_shares s join shared_assets a on a.id=s.asset_id where s.id=$1 and (a.owner_user_id=$2 or (s.state='active' and exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=s.channel_id and om.user_id=$2)))").bind(reference).bind(user).fetch_optional(&self.pool).await.map_err(Into::into)
    }
    pub async fn asset_publication(
        &self,
        user: Uuid,
        reference: Uuid,
        kind: &str,
    ) -> anyhow::Result<Option<Uuid>> {
        sqlx::query_scalar("select a.publication_share_id from channel_shares s join shared_assets a on a.id=s.asset_id where s.id=$1 and a.owner_user_id=$2 and a.kind=$3 and exists(select 1 from channel_shares r where r.asset_id=a.id and r.state='active')").bind(reference).bind(user).bind(kind).fetch_optional(&self.pool).await.map_err(Into::into)
    }
    pub(crate) async fn asset_can_read(
        &self,
        user: Uuid,
        reference: Uuid,
        kind: &str,
    ) -> anyhow::Result<bool> {
        // A withdrawn publication anchor is usable only by its owner while another authorized
        // reference is active. Consumers must always authorize their exact Channel reference.
        sqlx::query_scalar("select exists(select 1 from channel_shares s join shared_assets a on a.id=s.asset_id where s.id=$1 and a.kind=$3 and ((s.state='active' and exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=s.channel_id and om.user_id=$2)) or (s.id=a.publication_share_id and a.owner_user_id=$2 and exists(select 1 from channel_shares r join channel_members cm on cm.channel_id=r.channel_id join organization_members om on om.id=cm.organization_member_id where r.asset_id=a.id and r.state='active' and om.user_id=$2))))").bind(reference).bind(user).bind(kind).fetch_one(&self.pool).await.map_err(Into::into)
    }
    pub async fn reclaim_expired_assets(&self) -> anyhow::Result<u64> {
        let mut tx = self.pool.begin().await?;
        let expired:Vec<Uuid>=sqlx::query_scalar("select a.id from shared_assets a where a.retained_until<=now() and not exists(select 1 from channel_shares s where s.asset_id=a.id and s.state='active') order by a.id for update of a skip locked").fetch_all(&mut *tx).await?;
        if expired.is_empty() {
            return Ok(0);
        }
        // Clear heads and durable revision metadata together before GC can remove bytes. A later
        // re-share must start a full publication, never reuse a head whose bytes were collected.
        sqlx::query("update shared_assets set current_root_oid=null,current_snapshot_id=null,updated_at=now() where id=any($1)").bind(&expired).execute(&mut *tx).await?;
        sqlx::query("delete from file_revisions where share_id in (select publication_share_id from shared_assets where id=any($1))").bind(&expired).execute(&mut *tx).await?;
        sqlx::query("delete from session_snapshots where share_id in (select publication_share_id from shared_assets where id=any($1))").bind(&expired).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(expired.len() as u64)
    }
}
