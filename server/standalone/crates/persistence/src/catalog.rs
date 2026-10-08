use super::*;

/// Discovery metadata only. Preview bodies retain their existing read protocols.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub parent_id: Option<Uuid>,
    pub updated_at: String,
}

impl Database {
    pub async fn catalog_children(
        &self, user: Uuid, channel: Uuid, parent: Option<Uuid>, offset: i64, limit: i64,
    ) -> anyhow::Result<Option<Vec<CatalogItem>>> {
        if self.channel_actor(user, channel).await?.is_none() { return Ok(None); }
        if let Some(parent) = parent {
            let local: bool = sqlx::query_scalar("select exists(select 1 from canvas_folders where id=$1 and channel_id=$2)")
                .bind(parent).bind(channel).fetch_one(&self.pool).await?;
            if !local { return Ok(None); }
        }
        let rows = sqlx::query_as(
            "select id,kind,name,parent_id,updated_at::text updated_at from (
                select id,'catalog'::text kind,name,parent_folder_id parent_id,updated_at
                from canvas_folders where channel_id=$1 and parent_folder_id is not distinct from $2
                union all
                select id,kind,name,catalog_id parent_id,updated_at
                from channel_shares where channel_id=$1 and catalog_id is not distinct from $2 and state='active'
                union all
                select id,'canvas'::text kind,title name,folder_id parent_id,updated_at
                from canvases where channel_id=$1 and folder_id is not distinct from $2 and archived_at is null
            ) items order by (kind='catalog') desc,lower(name),id limit $3 offset $4"
        ).bind(channel).bind(parent).bind(limit.clamp(1, 200)).bind(offset.max(0))
            .fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }

    pub async fn place_catalog_item(
        &self, user: Uuid, channel: Uuid, kind: &str, item: Uuid, parent: Option<Uuid>,
    ) -> anyhow::Result<bool> {
        let Some((member, _)) = self.channel_actor(user, channel).await? else { return Ok(false); };
        let mut tx = self.pool.begin().await?;
        // Serialize catalog reparenting with the Channel row so two concurrent
        // moves cannot both pass cycle validation against the old tree.
        sqlx::query("select id from channels where id=$1 for update")
            .bind(channel).execute(&mut *tx).await?;
        if let Some(parent) = parent {
            let valid: bool = sqlx::query_scalar("select exists(select 1 from canvas_folders where id=$1 and channel_id=$2)")
                .bind(parent).bind(channel).fetch_one(&mut *tx).await?;
            if !valid { return Ok(false); }
        }
        let affected = match kind {
            "catalog" => {
                let cycle: bool = sqlx::query_scalar("with recursive ancestors as (
                    select id,parent_folder_id from canvas_folders where id=$1 and channel_id=$2
                    union select f.id,f.parent_folder_id from canvas_folders f join ancestors a on f.id=a.parent_folder_id
                    where f.channel_id=$2
                ) select exists(select 1 from ancestors where id=$3)")
                    .bind(parent).bind(channel).bind(item).fetch_one(&mut *tx).await?;
                if cycle { return Ok(false); }
                sqlx::query("update canvas_folders set parent_folder_id=$3,updated_at=now() where id=$1 and channel_id=$2")
                    .bind(item).bind(channel).bind(parent).execute(&mut *tx).await?.rows_affected()
            }
            "canvas" => sqlx::query("update canvases set folder_id=$3,updated_at=now() where id=$1 and channel_id=$2 and archived_at is null")
                .bind(item).bind(channel).bind(parent).execute(&mut *tx).await?.rows_affected(),
            "session" | "files" | "skill" => sqlx::query("update channel_shares set catalog_id=$3,updated_at=now() where id=$1 and channel_id=$2 and state='active' and contributor_member_id=$4 and kind=$5")
                .bind(item).bind(channel).bind(parent).bind(member).bind(kind).execute(&mut *tx).await?.rows_affected(),
            _ => return Ok(false),
        };
        tx.commit().await?;
        Ok(affected == 1)
    }
}
