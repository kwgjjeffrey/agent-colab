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
    pub can_move: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires isolated COLAB_CATALOG_TEST_DATABASE_URL"]
    async fn catalog_tree_enforces_identity_channel_cycles_and_nonempty_delete() {
        let url=std::env::var("COLAB_CATALOG_TEST_DATABASE_URL").unwrap();
        assert!(url.contains("localhost")&&url.contains("catalog_test"));
        let db=Database::connect(&url,3).await.unwrap();
        let owner=Uuid::new_v4(); let outsider=Uuid::new_v4();
        for user in [owner,outsider] {sqlx::query("insert into users(id,email,display_name) values($1,$2,'Catalog test')").bind(user).bind(format!("{user}@example.test")).execute(&db.pool).await.unwrap();}
        let org=db.create_organization(owner,"Catalog test").await.unwrap();
        let a=db.create_channel(owner,org.id,"Catalog A",None).await.unwrap();
        let b=db.create_channel(owner,org.id,"Catalog B",None).await.unwrap();
        let root=db.create_canvas_folder(owner,a.id,None,"Design").await.unwrap().unwrap();
        let child=db.create_canvas_folder(owner,a.id,Some(root.id),"Implementation").await.unwrap().unwrap();
        assert!(!db.place_catalog_item(owner,a.id,"catalog",root.id,Some(child.id)).await.unwrap());
        assert!(!db.place_catalog_item(owner,b.id,"catalog",root.id,None).await.unwrap());
        assert!(db.catalog_children(outsider,a.id,None,0,100).await.unwrap().is_none());
        assert!(!db.delete_empty_catalog(owner,a.id,root.id).await.unwrap());
        let document=db.create_canvas(owner,a.id,"Stable document",None).await.unwrap().unwrap();
        assert!(db.place_catalog_item(owner,a.id,"canvas",document.id,Some(child.id)).await.unwrap());
        let rows=db.catalog_children(owner,a.id,Some(child.id),0,100).await.unwrap().unwrap();
        assert_eq!(rows[0].id,document.id);
        assert!(!db.delete_empty_catalog(owner,a.id,child.id).await.unwrap());
        assert!(db.place_catalog_item(owner,a.id,"canvas",document.id,None).await.unwrap());
        assert!(db.delete_empty_catalog(owner,a.id,child.id).await.unwrap());
        assert!(db.delete_empty_catalog(owner,a.id,root.id).await.unwrap());
        assert!(db.canvas_channel(owner,document.id).await.unwrap().is_some());
    }
}

impl Database {
    pub async fn catalog_trail(&self,user:Uuid,channel:Uuid,kind:&str,item:Uuid)->anyhow::Result<Option<Vec<CatalogItem>>> {
        let Some((member,_))=self.channel_actor(user,channel).await? else{return Ok(None);};
        let rows=sqlx::query_as("with recursive items as (
            select id,'catalog'::text kind,name,parent_folder_id parent_id,updated_at,true can_move from canvas_folders where channel_id=$1
            union all select id,kind,name,catalog_id,updated_at,contributor_member_id=$4 from channel_shares where channel_id=$1 and state='active'
            union all select id,'canvas'::text,title,folder_id,updated_at,true from canvases where channel_id=$1 and archived_at is null
        ), trail as (
            select *,0 depth from items where id=$2 and kind=$3
            union all select i.*,t.depth+1 from items i join trail t on i.id=t.parent_id and i.kind='catalog' where t.depth<64
        ) select id,kind,name,parent_id,updated_at::text updated_at,can_move from trail order by depth desc")
            .bind(channel).bind(item).bind(kind).bind(member).fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }
    pub async fn delete_empty_catalog(&self, user: Uuid, channel: Uuid, catalog: Uuid) -> anyhow::Result<bool> {
        if self.channel_actor(user, channel).await?.is_none() { return Ok(false); }
        let mut tx = self.pool.begin().await?;
        sqlx::query("select id from channels where id=$1 for update").bind(channel).execute(&mut *tx).await?;
        // Keep terminal asset records while detaching only invisible children.
        sqlx::query("update channel_shares set catalog_id=null where catalog_id=$1 and channel_id=$2 and state='withdrawn'")
            .bind(catalog).bind(channel).execute(&mut *tx).await?;
        sqlx::query("update canvases set folder_id=null where folder_id=$1 and channel_id=$2 and archived_at is not null")
            .bind(catalog).bind(channel).execute(&mut *tx).await?;
        let affected = sqlx::query("delete from canvas_folders f where id=$1 and channel_id=$2
            and not exists(select 1 from canvas_folders where parent_folder_id=f.id)
            and not exists(select 1 from canvases where folder_id=f.id)
            and not exists(select 1 from channel_shares where catalog_id=f.id)")
            .bind(catalog).bind(channel).execute(&mut *tx).await?.rows_affected();
        tx.commit().await?;
        Ok(affected == 1)
    }
    pub async fn catalog_children(
        &self, user: Uuid, channel: Uuid, parent: Option<Uuid>, offset: i64, limit: i64,
    ) -> anyhow::Result<Option<Vec<CatalogItem>>> {
        let Some((member,_))=self.channel_actor(user, channel).await? else { return Ok(None); };
        if let Some(parent) = parent {
            let local: bool = sqlx::query_scalar("select exists(select 1 from canvas_folders where id=$1 and channel_id=$2)")
                .bind(parent).bind(channel).fetch_one(&self.pool).await?;
            if !local { return Ok(None); }
        }
        let rows = sqlx::query_as(
            "select id,kind,name,parent_id,updated_at::text updated_at,can_move from (
                select id,'catalog'::text kind,name,parent_folder_id parent_id,updated_at,true can_move
                from canvas_folders where channel_id=$1 and parent_folder_id is not distinct from $2
                union all
                select id,kind,name,catalog_id parent_id,updated_at,contributor_member_id=$5
                from channel_shares where channel_id=$1 and catalog_id is not distinct from $2 and state='active'
                union all
                select id,'canvas'::text kind,title name,folder_id parent_id,updated_at,true
                from canvases where channel_id=$1 and folder_id is not distinct from $2 and archived_at is null
            ) items order by (kind='catalog') desc,lower(name),id limit $3 offset $4"
        ).bind(channel).bind(parent).bind(limit.clamp(1, 200)).bind(offset.max(0)).bind(member)
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
