use crate::*;
use serde::{Deserialize, Serialize};
#[derive(Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SkillRelease {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub version: String,
    pub artifact_sha256: String,
    pub artifact_size: i64,
    pub root_oid: String,
    pub source_commit: Option<String>,
    pub release_notes: String,
    pub published_by: Uuid,
    pub created_at: String,
}

impl Database {
    pub async fn skill_release_access(
        &self,
        user: Uuid,
        reference: Uuid,
        write: bool,
    ) -> anyhow::Result<Option<(Uuid, Uuid, Option<String>)>> {
        if !self.asset_can_read(user, reference, "skill").await? {
            return Ok(None);
        }
        sqlx::query_as("select a.id,a.publication_share_id,a.current_root_oid from shared_assets a join channel_shares s on s.asset_id=a.id where s.id=$1 and a.source_adapter='skill-release-v1' and (not $3 or a.owner_user_id=$2 or exists(select 1 from skill_publishers p where p.asset_id=a.id and p.user_id=$2))")
   .bind(reference).bind(user).bind(write).fetch_optional(&self.pool).await.map_err(Into::into)
    }
    pub async fn list_skill_releases(
        &self,
        user: Uuid,
        reference: Uuid,
    ) -> anyhow::Result<Option<Vec<SkillRelease>>> {
        let Some((asset, _, _)) = self.skill_release_access(user, reference, false).await? else {
            return Ok(None);
        };
        Ok(Some(sqlx::query_as("select id,asset_id,version,artifact_sha256,artifact_size,root_oid,source_commit,release_notes,published_by,created_at::text created_at from skill_releases where asset_id=$1 order by created_at desc limit 100").bind(asset).fetch_all(&self.pool).await?))
    }
    pub async fn publish_skill_release(
        &self,
        user: Uuid,
        reference: Uuid,
        version: &str,
        digest: &str,
        artifact_key: &str,
        artifact_size: i64,
        root: &str,
        parent: Option<&str>,
        pack_key: &str,
        pack_size: i64,
        commit: Option<&str>,
        notes: &str,
    ) -> anyhow::Result<Option<SkillRelease>> {
        let Some((asset, publication, _)) =
            self.skill_release_access(user, reference, true).await?
        else {
            return Ok(None);
        };
        let mut tx = self.pool.begin().await?;
        // Match revision publication lock order: owner quota precedes the asset lock.
        let owner: Uuid = sqlx::query_scalar("select owner_user_id from shared_assets where id=$1")
            .bind(asset)
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query("select pg_advisory_xact_lock(hashtext($1::text))")
            .bind(owner)
            .execute(&mut *tx)
            .await?;
        sqlx::query("select id from shared_assets where id=$1 for update")
            .bind(asset)
            .execute(&mut *tx)
            .await?;
        // Publisher changes use the same asset lock, so a completed revocation wins.
        let allowed:bool=sqlx::query_scalar("select owner_user_id=$2 or exists(select 1 from skill_publishers where asset_id=$1 and user_id=$2) from shared_assets where id=$1").bind(asset).bind(user).fetch_one(&mut *tx).await?;
        if !allowed {
            return Ok(None);
        }
        if let Some(prior)=sqlx::query_as::<_,SkillRelease>("select id,asset_id,version,artifact_sha256,artifact_size,root_oid,source_commit,release_notes,published_by,created_at::text created_at from skill_releases where asset_id=$1 and version=$2").bind(asset).bind(version).fetch_optional(&mut *tx).await? {
   if prior.artifact_sha256!=digest {anyhow::bail!("skill_version_conflict")}; return Ok(Some(prior));
  }
        let current: Option<String> =
            sqlx::query_scalar("select current_root_oid from shared_assets where id=$1")
                .bind(asset)
                .fetch_one(&mut *tx)
                .await?;
        if current.as_deref() != parent {
            anyhow::bail!("skill_release_head_conflict")
        }
        let used:i64=sqlx::query_scalar("select coalesce(sum(byte_size),0)::bigint from file_revisions r join shared_assets a on a.publication_share_id=r.share_id where a.owner_user_id=$1").bind(owner).fetch_one(&mut *tx).await?;
        let archives:i64=sqlx::query_scalar("select coalesce(sum(artifact_size),0)::bigint from skill_releases r join shared_assets a on a.id=r.asset_id where a.owner_user_id=$1").bind(owner).fetch_one(&mut *tx).await?;
        if used
            .saturating_add(archives)
            .saturating_add(pack_size)
            .saturating_add(artifact_size)
            > 2 * 1024 * 1024 * 1024
        {
            anyhow::bail!("storage quota exceeded")
        }
        let revision = Uuid::new_v4();
        sqlx::query("insert into file_revisions(id,share_id,root_oid,parent_root_oid,blob_key,byte_size) values($1,$2,$3,$4,$5,$6)").bind(revision).bind(publication).bind(root).bind(parent).bind(pack_key).bind(pack_size).execute(&mut *tx).await?;
        let release=sqlx::query_as::<_,SkillRelease>("insert into skill_releases(id,asset_id,version,artifact_sha256,artifact_blob_key,artifact_size,revision_id,root_oid,source_commit,release_notes,published_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id,asset_id,version,artifact_sha256,artifact_size,root_oid,source_commit,release_notes,published_by,created_at::text created_at").bind(Uuid::new_v4()).bind(asset).bind(version).bind(digest).bind(artifact_key).bind(artifact_size).bind(revision).bind(root).bind(commit).bind(notes).bind(user).fetch_one(&mut *tx).await?;
        sqlx::query("update shared_assets set current_root_oid=$2,retained_until=null,updated_at=now() where id=$1").bind(asset).bind(root).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(release))
    }
    pub async fn skill_release_blob(
        &self,
        user: Uuid,
        reference: Uuid,
        version: &str,
    ) -> anyhow::Result<Option<String>> {
        let Some((asset, _, _)) = self.skill_release_access(user, reference, false).await? else {
            return Ok(None);
        };
        sqlx::query_scalar(
            "select artifact_blob_key from skill_releases where asset_id=$1 and version=$2",
        )
        .bind(asset)
        .bind(version)
        .fetch_optional(&self.pool)
        .await
        .map_err(Into::into)
    }
    pub async fn promote_skill_release(
        &self,
        user: Uuid,
        reference: Uuid,
        version: &str,
    ) -> anyhow::Result<bool> {
        let Some((asset, _, _)) = self.skill_release_access(user, reference, true).await? else {
            return Ok(false);
        };
        Ok(sqlx::query("update shared_assets a set current_root_oid=r.root_oid,updated_at=now() from skill_releases r where a.id=$1 and r.asset_id=a.id and r.version=$2").bind(asset).bind(version).execute(&self.pool).await?.rows_affected()==1)
    }
    pub async fn grant_skill_publisher(
        &self,
        user: Uuid,
        reference: Uuid,
        publisher: Uuid,
        enabled: bool,
    ) -> anyhow::Result<bool> {
        let Some((asset, _, _)) = self.skill_release_access(user, reference, true).await? else {
            return Ok(false);
        };
        let mut tx = self.pool.begin().await?;
        sqlx::query("select id from shared_assets where id=$1 for update")
            .bind(asset)
            .execute(&mut *tx)
            .await?;
        let owns: bool =
            sqlx::query_scalar("select owner_user_id=$2 from shared_assets where id=$1")
                .bind(asset)
                .bind(user)
                .fetch_one(&mut *tx)
                .await?;
        if !owns {
            return Ok(false);
        };
        if enabled {
            sqlx::query("insert into skill_publishers(asset_id,user_id) values($1,$2) on conflict do nothing").bind(asset).bind(publisher).execute(&mut *tx).await?;
        } else {
            sqlx::query("delete from skill_publishers where asset_id=$1 and user_id=$2")
                .bind(asset)
                .bind(publisher)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(true)
    }
}
