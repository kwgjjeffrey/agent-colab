//! Bearer invitations grant ordinary membership, never access to a sender's local device.
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteLink {
    pub id: Uuid,
    pub token: String,
    pub expires_at: String,
}
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InviteTarget {
    pub channel_id: Uuid,
    pub channel_name: String,
    pub organization_id: Uuid,
}

impl Database {
    pub async fn create_invite_link(
        &self,
        user: Uuid,
        channel: Uuid,
    ) -> anyhow::Result<Option<InviteLink>> {
        let mut tx = self.pool.begin().await?;
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2 and cm.role in ('owner','admin'))").bind(channel).bind(user).fetch_one(&mut *tx).await?;
        if !allowed {
            return Ok(None);
        }
        let id = Uuid::new_v4();
        let token = new_token("colab_invite_");
        let expires_at:String=sqlx::query_scalar("insert into channel_invite_links(id,channel_id,created_by,token_hash) values($1,$2,$3,$4) returning expires_at::text")
            .bind(id).bind(channel).bind(user).bind(token_hash(&token)).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(InviteLink {
            id,
            token,
            expires_at,
        }))
    }

    pub async fn invite_target(&self, token: &str) -> anyhow::Result<Option<InviteTarget>> {
        Ok(sqlx::query_as("select c.id channel_id,c.name channel_name,c.organization_id from channel_invite_links i join channels c on c.id=i.channel_id where i.token_hash=$1 and i.expires_at>now() and i.revoked_at is null")
            .bind(token_hash(token)).fetch_optional(&self.pool).await?)
    }

    pub async fn accept_invite_link(
        &self,
        user: Uuid,
        token: &str,
    ) -> anyhow::Result<Option<InviteTarget>> {
        let mut tx = self.pool.begin().await?;
        let target:Option<InviteTarget>=sqlx::query_as("select c.id channel_id,c.name channel_name,c.organization_id from channel_invite_links i join channels c on c.id=i.channel_id where i.token_hash=$1 and i.expires_at>now() and i.revoked_at is null for update of i")
            .bind(token_hash(token)).fetch_optional(&mut *tx).await?;
        let Some(target) = target else {
            return Ok(None);
        };
        let member:Uuid=sqlx::query_scalar("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$3,'member') on conflict(organization_id,user_id) do update set user_id=excluded.user_id returning id")
            .bind(Uuid::new_v4()).bind(target.organization_id).bind(user).fetch_one(&mut *tx).await?;
        sqlx::query("insert into channel_members(channel_id,organization_id,organization_member_id,role) values($1,$2,$3,'member') on conflict(channel_id,organization_member_id) do nothing")
            .bind(target.channel_id).bind(target.organization_id).bind(member).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(target))
    }

    pub async fn revoke_invite_link(&self, user: Uuid, id: Uuid) -> anyhow::Result<bool> {
        Ok(sqlx::query("update channel_invite_links i set revoked_at=coalesce(revoked_at,now()) where id=$1 and exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=i.channel_id and om.user_id=$2 and cm.role in ('owner','admin'))")
            .bind(id).bind(user).execute(&self.pool).await?.rows_affected()>0)
    }
}
