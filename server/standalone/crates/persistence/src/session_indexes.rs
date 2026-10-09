//! Immutable snapshot locator projections. No provider transcript interpretation in Server.
use crate::Database;
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize,sqlx::FromRow)]
#[serde(rename_all="camelCase")]
pub struct SessionReadIndex {
    pub id:String,
    pub snapshot_id:Uuid,
    pub digest:String,
    pub byte_size:i64,
    pub decoded_digest:String,
    pub decoded_byte_size:i64,
}
impl Database {
    pub async fn commit_session_read_index(&self,user:Uuid,share:Uuid,index:&SessionReadIndex)->anyhow::Result<bool> {
        let Some(publication)=self.asset_publication(user,share,"session").await? else {return Ok(false)};
        let result=sqlx::query("update session_snapshots ss set read_index_blob_key=$3,read_index_digest=$4,read_index_byte_size=$5,read_index_decoded_digest=$6,read_index_decoded_byte_size=$7 where ss.id=$2 and ss.share_id=$1 and ss.read_index_blob_key is null and exists(select 1 from shared_assets a where a.publication_share_id=$1 and a.owner_user_id=$8 and a.current_snapshot_id=$2 and exists(select 1 from channel_shares s where s.asset_id=a.id and s.state='active'))")
            .bind(publication).bind(index.snapshot_id).bind(&index.id).bind(&index.digest).bind(index.byte_size).bind(&index.decoded_digest).bind(index.decoded_byte_size).bind(user).execute(&self.pool).await?;
        Ok(result.rows_affected()==1)
    }
    pub async fn session_read_index(&self,user:Uuid,share:Uuid)->anyhow::Result<Option<SessionReadIndex>> {
        if !self.asset_can_read(user,share,"session").await? {return Ok(None)}
        sqlx::query_as("select ss.read_index_blob_key id,ss.id snapshot_id,ss.read_index_digest digest,ss.read_index_byte_size byte_size,ss.read_index_decoded_digest decoded_digest,ss.read_index_decoded_byte_size decoded_byte_size from channel_shares s join shared_assets a on a.id=s.asset_id join session_snapshots ss on ss.id=a.current_snapshot_id where s.id=$1 and ss.read_index_blob_key is not null").bind(share).fetch_optional(&self.pool).await.map_err(Into::into)
    }
    pub async fn session_read_index_key(&self,user:Uuid,key:&str)->anyhow::Result<Option<String>> {
        sqlx::query_scalar("select ss.read_index_blob_key from session_snapshots ss join shared_assets a on a.publication_share_id=ss.share_id where ss.read_index_blob_key=$1 and exists(select 1 from channel_shares s join channel_members cm on cm.channel_id=s.channel_id join organization_members om on om.id=cm.organization_member_id where s.asset_id=a.id and s.state='active' and om.user_id=$2)").bind(key).bind(user).fetch_optional(&self.pool).await.map_err(Into::into)
    }
}
