use super::*;

pub fn invalid_activity_cursor(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<sqlx::Error>()
            .and_then(|e| e.as_database_error())
            .and_then(|e| e.code())
            .is_some_and(|code| code == "22007" || code == "22008")
    })
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChannelActivity {
    pub id: String,
    pub action: String,
    pub actor_name: String,
    pub resource_kind: String,
    pub resource_id: Uuid,
    pub resource_name: String,
    pub occurred_at: String,
    pub target_name: Option<String>,
    pub source: Option<String>,
    pub state: Option<String>,
}
impl Database {
    pub async fn record_share_read(&self, user: Uuid, share: Uuid) -> anyhow::Result<bool> {
        let result=sqlx::query("insert into share_read_activity(share_id,reader_member_id,channel_id) select s.id,cm.organization_member_id,s.channel_id from channel_shares s join channel_members cm on cm.channel_id=s.channel_id join organization_members om on om.id=cm.organization_member_id where s.id=$1 and s.state='active' and s.kind in ('files','session') and om.user_id=$2 on conflict(share_id,reader_member_id) do update set read_at=now()")
            .bind(share).bind(user).execute(&self.pool).await?;
        Ok(result.rows_affected() > 0)
    }
    pub async fn channel_activity(
        &self,
        user: Uuid,
        channel: Uuid,
        before: Option<&str>,
        before_id: &str,
        limit: i64,
    ) -> anyhow::Result<Option<Vec<ChannelActivity>>> {
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2)").bind(channel).bind(user).fetch_one(&self.pool).await?;
        if !allowed {
            return Ok(None);
        }
        // Limit each source before merging. No resource bodies or full Channel lists are loaded.
        let rows=sqlx::query_as::<_,ChannelActivity>(r#"
with shares as (
 select 'share:'||s.id id,'shared'::text action,coalesce(u.display_name,u.email) actor_name,s.kind resource_kind,s.id resource_id,s.name resource_name,s.created_at occurred_at,null::text target_name,null::text source,null::text state
 from channel_shares s join organization_members om on om.id=s.contributor_member_id join users u on u.id=om.user_id
 where s.channel_id=$1 and s.state='active' and s.kind in ('files','session') and ($2::timestamptz is null or (s.created_at,'share:'||s.id)<($2::timestamptz,$3)) order by s.created_at desc,s.id desc limit $4
), reads as (
 select 'read:'||r.share_id||':'||r.reader_member_id id,'read'::text action,coalesce(u.display_name,u.email) actor_name,s.kind resource_kind,s.id resource_id,s.name resource_name,r.read_at occurred_at,null::text target_name,null::text source,null::text state
 from share_read_activity r join channel_shares s on s.id=r.share_id join organization_members om on om.id=r.reader_member_id join users u on u.id=om.user_id
 where r.channel_id=$1 and s.state='active' and ($2::timestamptz is null or (r.read_at,'read:'||r.share_id||':'||r.reader_member_id)<($2::timestamptz,$3)) order by r.read_at desc,r.share_id desc,r.reader_member_id desc limit $4
), commands as (
 select 'request:'||r.id id,'requested'::text action,coalesce(u.display_name,u.email) actor_name,'message'::text resource_kind,coalesce(r.trigger_message_id,r.id) resource_id,left(r.query,160) resource_name,r.created_at occurred_at,b.name target_name,case when r.source_canvas_id is null then 'Messages' else 'Canvas' end source,r.state
 from agent_requests r join agent_blueprints b on b.id=r.target_blueprint_id join organization_members om on om.id=r.requester_member_id join users u on u.id=om.user_id
 where r.channel_id=$1 and ($2::timestamptz is null or (r.created_at,'request:'||r.id)<($2::timestamptz,$3)) order by r.created_at desc,r.id desc limit $4
), documents as (
 select 'canvas:'||c.id id,'created'::text action,coalesce(u.display_name,u.email) actor_name,'canvas'::text resource_kind,c.id resource_id,c.title resource_name,c.created_at occurred_at,null::text target_name,null::text source,null::text state
 from canvases c join organization_members om on om.id=c.created_by_member_id join users u on u.id=om.user_id
 where c.channel_id=$1 and c.archived_at is null and ($2::timestamptz is null or (c.created_at,'canvas:'||c.id)<($2::timestamptz,$3)) order by c.created_at desc,c.id desc limit $4
)
select id,action,actor_name,resource_kind,resource_id,resource_name,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at,target_name,source,state from (select * from shares union all select * from reads union all select * from commands union all select * from documents) all_activity order by all_activity.occurred_at desc,id desc limit $4
"#).bind(channel).bind(before).bind(before_id).bind(limit.clamp(1,51)).fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires isolated COLAB_ACTIVITY_TEST_DATABASE_URL"]
    async fn recent_activity_permissions_pagination_and_reads() {
        let url = std::env::var("COLAB_ACTIVITY_TEST_DATABASE_URL").unwrap();
        assert!(
            url.contains("127.0.0.1") && url.contains("test"),
            "only an isolated local test DB"
        );
        let db = Database::connect(&url, 3).await.unwrap();
        let user = Uuid::new_v4();
        let outsider = Uuid::new_v4();
        for id in [user, outsider] {
            sqlx::query("insert into users(id,email,display_name) values($1,$2,'Activity tester')")
                .bind(id)
                .bind(format!("{id}@example.test"))
                .execute(&db.pool)
                .await
                .unwrap();
        }
        let org = db.create_organization(user, "Activity test").await.unwrap();
        let channel = db
            .create_channel(user, org.id, "Activity test", None)
            .await
            .unwrap();
        let mut share = None;
        for i in 0..25 {
            share = Some(
                db.create_file_share(user, channel.id, &format!("Asset {i}"))
                    .await
                    .unwrap()
                    .unwrap(),
            );
        }
        let share = share.unwrap();
        assert!(!db.record_share_read(outsider, share.id).await.unwrap());
        assert!(
            db.channel_activity(outsider, channel.id, None, "", 20)
                .await
                .unwrap()
                .is_none()
        );
        assert!(db.record_share_read(user, share.id).await.unwrap());
        assert!(db.record_share_read(user, share.id).await.unwrap());
        let page = db
            .channel_activity(user, channel.id, None, "", 20)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(page.len(), 20);
        assert_eq!(page[0].action, "read");
        assert_eq!(
            page.iter().filter(|r| r.action == "read").count(),
            1,
            "repeated reads coalesce"
        );
        let last = page.last().unwrap();
        let next = db
            .channel_activity(user, channel.id, Some(&last.occurred_at), &last.id, 20)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(next.len(), 6);
        assert!(next.iter().all(|r| !page.iter().any(|p| p.id == r.id)));
        let canvas = db
            .create_canvas(user, channel.id, "Team progress", None)
            .await
            .unwrap()
            .unwrap();
        let runtime = Uuid::new_v4();
        let blueprint = Uuid::new_v4();
        sqlx::query("insert into agent_runtimes(id,organization_id,owner_member_id,device_id,device_name,provider,skill_version) values($1,$2,$3,$4,'Test device','codex','test')").bind(runtime).bind(org.id).bind(org.member_id).bind(Uuid::new_v4()).execute(&db.pool).await.unwrap();
        sqlx::query("insert into agent_blueprints(id,organization_id,owner_member_id,name,runtime_id) values($1,$2,$3,'Test Agent',$4)").bind(blueprint).bind(org.id).bind(org.member_id).bind(runtime).execute(&db.pool).await.unwrap();
        for source in [None, Some(canvas.id)] {
            sqlx::query("insert into agent_requests(id,channel_id,target_blueprint_id,runtime_id,requester_member_id,kind,query,state,source_canvas_id) values($1,$2,$3,$4,$5,'forward',$6,'queued',$7)").bind(Uuid::new_v4()).bind(channel.id).bind(blueprint).bind(runtime).bind(org.member_id).bind("task ".repeat(50)).bind(source).execute(&db.pool).await.unwrap();
        }
        let updated = db
            .channel_activity(user, channel.id, None, "", 50)
            .await
            .unwrap()
            .unwrap();
        let commands = updated
            .iter()
            .filter(|r| r.action == "requested")
            .collect::<Vec<_>>();
        assert_eq!(commands.len(), 2);
        assert!(
            commands
                .iter()
                .any(|r| r.source.as_deref() == Some("Messages"))
        );
        assert!(
            commands
                .iter()
                .any(|r| r.source.as_deref() == Some("Canvas"))
        );
        assert!(
            commands
                .iter()
                .all(|r| r.target_name.as_deref() == Some("Test Agent")
                    && r.resource_name.chars().count() == 160)
        );
        assert!(
            updated
                .iter()
                .any(|r| r.action == "created" && r.resource_id == canvas.id)
        );
        sqlx::query("update channel_shares set state='withdrawn' where id=$1")
            .bind(share.id)
            .execute(&db.pool)
            .await
            .unwrap();
        assert!(!db.record_share_read(user, share.id).await.unwrap());
        assert!(
            db.channel_activity(user, channel.id, None, "", 50)
                .await
                .unwrap()
                .unwrap()
                .iter()
                .all(|r| r.resource_id != share.id)
        );
        // Retain isolated fixture rows for inspection; every run uses fresh UUIDs.
    }
}
