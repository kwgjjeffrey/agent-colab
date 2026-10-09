use super::*;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Canvas {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub title: String,
    pub created_by_member_id: Uuid,
    pub creator_name: String,
    pub folder_id: Option<Uuid>,
    pub schema_version: i32,
    pub last_server_seq: i64,
    pub can_edit: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CanvasFolder {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub parent_folder_id: Option<Uuid>,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CanvasUpdate {
    pub canvas_id: Uuid,
    pub server_seq: i64,
    pub client_update_id: Uuid,
    pub encoding: String,
    pub update_bytes: Vec<u8>,
    pub byte_size: i32,
    pub created_at: String,
}

impl Database {
    pub async fn canvas_channel(
        &self,
        user_id: Uuid,
        canvas_id: Uuid,
    ) -> anyhow::Result<Option<Uuid>> {
        sqlx::query_scalar("select c.channel_id from canvases c join channel_members cm on cm.channel_id=c.channel_id join organization_members om on om.id=cm.organization_member_id where c.id=$1 and c.archived_at is null and om.user_id=$2")
            .bind(canvas_id).bind(user_id).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    pub async fn canvas_command_context(
        &self,
        user_id: Uuid,
        canvas_id: Uuid,
    ) -> anyhow::Result<Option<(Uuid, String, String)>> {
        sqlx::query_as("select c.channel_id,ch.name,c.title from canvases c join channels ch on ch.id=c.channel_id join channel_members cm on cm.channel_id=c.channel_id join organization_members om on om.id=cm.organization_member_id where c.id=$1 and c.archived_at is null and om.user_id=$2")
            .bind(canvas_id)
            .bind(user_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(Into::into)
    }

    pub async fn list_canvases(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<Canvas>>> {
        let Some((member_id, _)) = self.channel_actor(user_id, channel_id).await? else {
            return Ok(None);
        };
        let rows = sqlx::query_as(
"select c.id,c.channel_id,c.title,c.created_by_member_id,(select coalesce(u.display_name,u.email) from organization_members om join users u on u.id=om.user_id where om.id=c.created_by_member_id) creator_name,c.folder_id,c.schema_version,coalesce((select max(u.server_seq) from canvas_updates u where u.canvas_id=c.id),0) last_server_seq,true can_edit,c.created_at::text created_at,c.updated_at::text updated_at from canvases c where c.channel_id=$1 and c.archived_at is null order by c.sort_order,lower(c.title),c.id",
        )
        .bind(channel_id)
        .fetch_all(&self.pool)
        .await?;
        let _ = member_id;
        Ok(Some(rows))
    }

    pub async fn create_canvas(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        title: &str,
        folder_id: Option<Uuid>,
    ) -> anyhow::Result<Option<Canvas>> {
        let Some((member_id, _)) = self.channel_actor(user_id, channel_id).await? else {
            return Ok(None);
        };
        if let Some(folder_id) = folder_id {
            let folder_is_local: bool = sqlx::query_scalar(
                "select exists(select 1 from canvas_folders where id=$1 and channel_id=$2)",
            )
            .bind(folder_id)
            .bind(channel_id)
            .fetch_one(&self.pool)
            .await?;
            if !folder_is_local {
                return Ok(None);
            }
        }
        let id = Uuid::new_v4();
        let row = sqlx::query_as(
            "insert into canvases(id,channel_id,title,folder_id,created_by_member_id,sort_order) values($1,$2,$3,$4,$5,(select coalesce(max(sort_order),0)+1 from canvases where channel_id=$2 and folder_id is not distinct from $4 and archived_at is null)) returning id,channel_id,title,created_by_member_id,(select coalesce(u.display_name,u.email) from organization_members om join users u on u.id=om.user_id where om.id=$5) creator_name,folder_id,schema_version,0::bigint last_server_seq,true can_edit,created_at::text created_at,updated_at::text updated_at",
        )
        .bind(id)
        .bind(channel_id)
        .bind(title)
        .bind(folder_id)
        .bind(member_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(Some(row))
    }

    pub async fn rename_canvas(
        &self,
        user_id: Uuid,
        canvas_id: Uuid,
        title: &str,
    ) -> anyhow::Result<Option<Canvas>> {
        let row = sqlx::query_as(
            "update canvases c set title=$3,updated_at=now() from channel_members cm join organization_members om on om.id=cm.organization_member_id where c.id=$1 and c.archived_at is null and cm.channel_id=c.channel_id and om.user_id=$2 returning c.id,c.channel_id,c.title,c.created_by_member_id,(select coalesce(u.display_name,u.email) from organization_members owner join users u on u.id=owner.user_id where owner.id=c.created_by_member_id) creator_name,c.folder_id,c.schema_version,coalesce((select max(u.server_seq) from canvas_updates u where u.canvas_id=c.id),0) last_server_seq,true can_edit,c.created_at::text created_at,c.updated_at::text updated_at",
        )
        .bind(canvas_id)
        .bind(user_id)
        .bind(title)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn archive_canvas(&self, user_id: Uuid, canvas_id: Uuid) -> anyhow::Result<bool> {
        let result = sqlx::query("update canvases c set archived_at=now(),updated_at=now() from channel_members cm join organization_members om on om.id=cm.organization_member_id where c.id=$1 and c.archived_at is null and cm.channel_id=c.channel_id and om.user_id=$2")
            .bind(canvas_id).bind(user_id).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn move_canvas(&self, user_id: Uuid, canvas_id: Uuid, folder_id: Option<Uuid>, index: usize) -> anyhow::Result<bool> {
        let mut tx = self.pool.begin().await?;
        let channel: Option<Uuid> = sqlx::query_scalar("select c.channel_id from canvases c join channel_members cm on cm.channel_id=c.channel_id join organization_members om on om.id=cm.organization_member_id where c.id=$1 and c.archived_at is null and om.user_id=$2 for update of c")
            .bind(canvas_id).bind(user_id).fetch_optional(&mut *tx).await?;
        let Some(channel) = channel else { return Ok(false); };
        if let Some(folder) = folder_id {
            let valid: bool = sqlx::query_scalar("select exists(select 1 from canvas_folders where id=$1 and channel_id=$2)")
                .bind(folder).bind(channel).fetch_one(&mut *tx).await?;
            if !valid { return Ok(false); }
        }
        // Lock sibling order before renumbering. Drag/drop is a metadata mutation, never a Yjs update.
        let mut siblings: Vec<Uuid> = sqlx::query_scalar("select id from canvases where channel_id=$1 and folder_id is not distinct from $2 and archived_at is null and id<>$3 order by sort_order,lower(title),id for update")
            .bind(channel).bind(folder_id).bind(canvas_id).fetch_all(&mut *tx).await?;
        siblings.insert(index.min(siblings.len()), canvas_id);
        for (position, id) in siblings.into_iter().enumerate() {
            sqlx::query("update canvases set folder_id=$2,sort_order=$3,updated_at=now() where id=$1")
                .bind(id).bind(folder_id).bind(position as i64).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(true)
    }

    pub async fn list_canvas_folders(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<CanvasFolder>>> {
        if self.channel_actor(user_id, channel_id).await?.is_none() {
            return Ok(None);
        }
        let rows = sqlx::query_as("select id,channel_id,parent_folder_id,name,created_at::text created_at,updated_at::text updated_at from canvas_folders where channel_id=$1 order by lower(name),id")
            .bind(channel_id).fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }

    pub async fn create_canvas_folder(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        parent_folder_id: Option<Uuid>,
        name: &str,
    ) -> anyhow::Result<Option<CanvasFolder>> {
        let Some((member_id, _)) = self.channel_actor(user_id, channel_id).await? else {
            return Ok(None);
        };
        if let Some(parent_id) = parent_folder_id {
            let parent_is_local: bool = sqlx::query_scalar(
                "select exists(select 1 from canvas_folders where id=$1 and channel_id=$2)",
            )
            .bind(parent_id)
            .bind(channel_id)
            .fetch_one(&self.pool)
            .await?;
            if !parent_is_local {
                return Ok(None);
            }
        }
        let row = sqlx::query_as("insert into canvas_folders(id,channel_id,parent_folder_id,name,created_by_member_id) values($1,$2,$3,$4,$5) returning id,channel_id,parent_folder_id,name,created_at::text created_at,updated_at::text updated_at")
            .bind(Uuid::new_v4()).bind(channel_id).bind(parent_folder_id).bind(name).bind(member_id)
            .fetch_one(&self.pool).await?;
        Ok(Some(row))
    }

    pub async fn rename_canvas_folder(
        &self,
        user_id: Uuid,
        folder_id: Uuid,
        name: &str,
    ) -> anyhow::Result<Option<CanvasFolder>> {
        let row = sqlx::query_as(
            "update canvas_folders f set name=$3,updated_at=now() from channel_members cm join organization_members om on om.id=cm.organization_member_id where f.id=$1 and cm.channel_id=f.channel_id and om.user_id=$2 returning f.id,f.channel_id,f.parent_folder_id,f.name,f.created_at::text created_at,f.updated_at::text updated_at",
        )
        .bind(folder_id)
        .bind(user_id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn canvas_updates_after(
        &self,
        user_id: Uuid,
        canvas_id: Uuid,
        after: i64,
        limit: i64,
    ) -> anyhow::Result<Option<Vec<CanvasUpdate>>> {
        let allowed: bool = sqlx::query_scalar("select exists(select 1 from canvases c join channel_members cm on cm.channel_id=c.channel_id join organization_members om on om.id=cm.organization_member_id where c.id=$1 and c.archived_at is null and om.user_id=$2)")
            .bind(canvas_id).bind(user_id).fetch_one(&self.pool).await?;
        if !allowed {
            return Ok(None);
        }
        Ok(Some(sqlx::query_as("select canvas_id,server_seq,client_update_id,encoding,update_bytes,byte_size,created_at::text created_at from canvas_updates where canvas_id=$1 and server_seq>$2 order by server_seq limit $3")
            .bind(canvas_id).bind(after).bind(limit.clamp(1, 1000)).fetch_all(&self.pool).await?))
    }

    pub async fn append_canvas_update(
        &self,
        user_id: Uuid,
        canvas_id: Uuid,
        client_update_id: Uuid,
        device_id: Option<Uuid>,
        bytes: &[u8],
    ) -> anyhow::Result<Option<CanvasUpdate>> {
        let mut tx = self.pool.begin().await?;
        let actor: Option<Uuid> = sqlx::query_scalar("select om.id from canvases c join channel_members cm on cm.channel_id=c.channel_id join organization_members om on om.id=cm.organization_member_id where c.id=$1 and c.archived_at is null and om.user_id=$2 for update of c")
            .bind(canvas_id).bind(user_id).fetch_optional(&mut *tx).await?;
        let Some(actor) = actor else {
            return Ok(None);
        };
        if let Some(existing) = sqlx::query_as("select canvas_id,server_seq,client_update_id,encoding,update_bytes,byte_size,created_at::text created_at from canvas_updates where canvas_id=$1 and client_update_id=$2")
            .bind(canvas_id).bind(client_update_id).fetch_optional(&mut *tx).await? {
            tx.commit().await?;
            return Ok(Some(existing));
        }
        let next: i64 = sqlx::query_scalar(
            "select coalesce(max(server_seq),0)+1 from canvas_updates where canvas_id=$1",
        )
        .bind(canvas_id)
        .fetch_one(&mut *tx)
        .await?;
        let row = sqlx::query_as("insert into canvas_updates(canvas_id,server_seq,client_update_id,actor_member_id,device_id,update_bytes,byte_size) values($1,$2,$3,$4,$5,$6,$7) returning canvas_id,server_seq,client_update_id,encoding,update_bytes,byte_size,created_at::text created_at")
            .bind(canvas_id).bind(next).bind(client_update_id).bind(actor).bind(device_id).bind(bytes).bind(bytes.len() as i32).fetch_one(&mut *tx).await?;
        sqlx::query("update canvases set updated_at=now() where id=$1")
            .bind(canvas_id)
            .execute(&mut *tx)
            .await?;
        crate::canvas_images::reconcile_images(&mut tx,canvas_id).await?;
        tx.commit().await?;
        Ok(Some(row))
    }
}

// Seed once in the Channel transaction, including device-created personal Channels.
// Archived/deleted welcome documents are never re-created by reads or reconnects.
pub(crate) async fn seed_welcome_canvas(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, channel: Uuid, member: Uuid,
) -> anyhow::Result<()> {
    let id = Uuid::new_v4();
    let update = include_bytes!("../assets/welcome-canvas.yjs");
    sqlx::query("insert into canvases(id,channel_id,title,created_by_member_id) values($1,$2,'Welcome to Canvas',$3)")
        .bind(id).bind(channel).bind(member).execute(&mut **tx).await?;
    sqlx::query("insert into canvas_updates(canvas_id,server_seq,client_update_id,actor_member_id,update_bytes,byte_size) values($1,1,$2,$3,$4,$5)")
        .bind(id).bind(Uuid::new_v4()).bind(member).bind(update.as_slice()).bind(update.len() as i32).execute(&mut **tx).await?;
    Ok(())
}

#[cfg(test)]
mod welcome_tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires isolated COLAB_CANVAS_TEST_DATABASE_URL"]
    async fn welcome_canvas_is_durable_authorized_and_stays_deleted() {
        let url = std::env::var("COLAB_CANVAS_TEST_DATABASE_URL").unwrap();
        assert!(url.contains("127.0.0.1") && url.contains("test"));
        let db = Database::connect(&url, 3).await.unwrap();
        let user = Uuid::new_v4();
        let outsider = Uuid::new_v4();
        for id in [user, outsider] {
            sqlx::query("insert into users(id,email,display_name) values($1,$2,'Welcome test')")
                .bind(id).bind(format!("{id}@example.test")).execute(&db.pool).await.unwrap();
        }
        let org = db.create_organization(user, "Welcome test").await.unwrap();
        let channel = db.create_channel(user, org.id, "Welcome test", None).await.unwrap();
        let documents = db.list_canvases(user, channel.id).await.unwrap().unwrap();
        assert_eq!(documents.len(), 1);
        let document = &documents[0];
        assert_eq!(document.title, "Welcome to Canvas");
        assert_eq!(document.last_server_seq, 1);
        assert_eq!(document.created_by_member_id, org.member_id);
        assert!(db.list_canvases(outsider, channel.id).await.unwrap().is_none());
        let updates = db.canvas_updates_after(user, document.id, 0, 100).await.unwrap().unwrap();
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].update_bytes, include_bytes!("../assets/welcome-canvas.yjs"));
        assert!(db.archive_canvas(user, document.id).await.unwrap());
        assert!(db.list_canvases(user, channel.id).await.unwrap().unwrap().is_empty());
        drop(db);
        let reopened = Database::connect(&url, 3).await.unwrap();
        assert!(reopened.list_canvases(user, channel.id).await.unwrap().unwrap().is_empty());
    }
}
