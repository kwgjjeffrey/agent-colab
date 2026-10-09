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
    pub actor_member_id: Uuid,
    pub resource_kind: String,
    pub resource_id: Uuid,
    pub resource_name: String,
    pub occurred_at: String,
    pub target_name: Option<String>,
    pub target_blueprint_id: Option<Uuid>,
    pub preview_content: Option<serde_json::Value>,
    pub source: Option<String>,
    pub state: Option<String>,
}
impl Database {
    pub async fn record_share_read(&self, user: Uuid, share: Uuid) -> anyhow::Result<bool> {
        let result=sqlx::query("insert into share_read_activity(share_id,reader_member_id,channel_id) select s.id,cm.organization_member_id,s.channel_id from channel_shares s join channel_members cm on cm.channel_id=s.channel_id join organization_members om on om.id=cm.organization_member_id where s.id=$1 and s.state='active' and s.kind in ('files','session') and om.user_id=$2 on conflict(share_id,reader_member_id) do update set read_at=now()")
            .bind(share).bind(user).execute(&self.pool).await?;
        Ok(result.rows_affected() > 0)
    }
    /// Numbered pages expose total cardinality without loading resource bodies or all rows.
    pub async fn channel_activity_page(&self, user: Uuid, channel: Uuid, page: i64, limit: i64) -> anyhow::Result<Option<(Vec<ChannelActivity>, i64, i64)>> {
        let allowed: bool = sqlx::query_scalar("select exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2)").bind(channel).bind(user).fetch_one(&self.pool).await?;
        if !allowed { return Ok(None); }
        let total: i64 = sqlx::query_scalar(r#"
select
 (select count(*) from channel_shares s where s.channel_id=$1 and s.state='active' and s.kind in ('files','session')) +
 (select count(*) from share_read_activity r join channel_shares s on s.id=r.share_id where r.channel_id=$1 and s.state='active') +
 (select count(*) from agent_requests r join agent_blueprints b on b.id=r.target_blueprint_id where r.channel_id=$1) +
 (select count(*) from canvases c where c.channel_id=$1 and c.archived_at is null)
"#).bind(channel).fetch_one(&self.pool).await?;
        let limit = limit.clamp(1, 50);
        let page = page.clamp(1, ((total + limit - 1) / limit).max(1));
        let rows = self.channel_activity_window(user, channel, None, "", limit, (page - 1) * limit).await?;
        Ok(rows.map(|rows| (rows, total, page)))
    }
    pub async fn channel_activity(&self, user: Uuid, channel: Uuid, before: Option<&str>, before_id: &str, limit: i64) -> anyhow::Result<Option<Vec<ChannelActivity>>> {
        self.channel_activity_window(user, channel, before, before_id, limit, 0).await
    }
    async fn channel_activity_window(
        &self,
        user: Uuid,
        channel: Uuid,
        before: Option<&str>,
        before_id: &str,
        limit: i64,
        offset: i64,
    ) -> anyhow::Result<Option<Vec<ChannelActivity>>> {
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2)").bind(channel).bind(user).fetch_one(&self.pool).await?;
        if !allowed {
            return Ok(None);
        }
        // Limit each source before merging. No resource bodies or full Channel lists are loaded.
        let mut rows=sqlx::query_as::<_,ChannelActivity>(r#"
with shares as (
 select 'share:'||s.id id,'shared'::text action,coalesce(u.display_name,u.email) actor_name,s.kind resource_kind,s.id resource_id,s.name resource_name,s.created_at occurred_at,null::text target_name,null::text source,null::text state,om.id actor_member_id,null::uuid target_blueprint_id
 from channel_shares s join organization_members om on om.id=s.contributor_member_id join users u on u.id=om.user_id
 where s.channel_id=$1 and s.state='active' and s.kind in ('files','session') and ($2::timestamptz is null or (s.created_at,'share:'||s.id)<($2::timestamptz,$3)) order by s.created_at desc,s.id desc limit $4
), reads as (
 select 'read:'||r.share_id||':'||r.reader_member_id id,'read'::text action,coalesce(u.display_name,u.email) actor_name,s.kind resource_kind,s.id resource_id,s.name resource_name,r.read_at occurred_at,null::text target_name,null::text source,null::text state,om.id actor_member_id,null::uuid target_blueprint_id
 from share_read_activity r join channel_shares s on s.id=r.share_id join organization_members om on om.id=r.reader_member_id join users u on u.id=om.user_id
 where r.channel_id=$1 and s.state='active' and ($2::timestamptz is null or (r.read_at,'read:'||r.share_id||':'||r.reader_member_id)<($2::timestamptz,$3)) order by r.read_at desc,r.share_id desc,r.reader_member_id desc limit $4
), commands as (
 select 'request:'||r.id id,'requested'::text action,coalesce(u.display_name,u.email) actor_name,'message'::text resource_kind,coalesce(r.trigger_message_id,r.id) resource_id,left(r.query,160) resource_name,r.created_at occurred_at,b.name target_name,case when r.source_canvas_id is null then 'Messages' else 'Canvas' end source,r.state,om.id actor_member_id,b.id target_blueprint_id
 from agent_requests r join agent_blueprints b on b.id=r.target_blueprint_id join organization_members om on om.id=r.requester_member_id join users u on u.id=om.user_id
 where r.channel_id=$1 and ($2::timestamptz is null or (r.created_at,'request:'||r.id)<($2::timestamptz,$3)) order by r.created_at desc,r.id desc limit $4
), documents as (
 select 'canvas:'||c.id id,'created'::text action,coalesce(u.display_name,u.email) actor_name,'canvas'::text resource_kind,c.id resource_id,c.title resource_name,c.created_at occurred_at,null::text target_name,null::text source,null::text state,om.id actor_member_id,null::uuid target_blueprint_id
 from canvases c join organization_members om on om.id=c.created_by_member_id join users u on u.id=om.user_id
 where c.channel_id=$1 and c.archived_at is null and ($2::timestamptz is null or (c.created_at,'canvas:'||c.id)<($2::timestamptz,$3)) order by c.created_at desc,c.id desc limit $4
)
select a.id,action,actor_name,actor_member_id,resource_kind,resource_id,resource_name,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at,target_name,target_blueprint_id,source,state,m.content preview_content
from (select * from (select * from shares union all select * from reads union all select * from commands union all select * from documents) all_activity order by occurred_at desc,id desc limit $5 offset $6) a
left join channel_messages m on a.action='requested' and m.id=a.resource_id and m.channel_id=$1
order by a.occurred_at desc,a.id desc
"#).bind(channel).bind(before).bind(before_id).bind(offset + limit.clamp(1,51)).bind(limit.clamp(1,51)).bind(offset).fetch_all(&self.pool).await?;
        for row in &mut rows {
            row.preview_content = row.preview_content.as_ref().map(activity_preview);
        }
        Ok(Some(rows))
    }
}

// A feed preview preserves atomic identities, but never ships a whole message or task log.
fn activity_preview(document: &serde_json::Value) -> serde_json::Value {
    fn visit(
        node: &serde_json::Value,
        left: &mut usize,
        out: &mut Vec<serde_json::Value>,
        depth: usize,
    ) {
        if *left == 0 || out.len() >= 40 || depth > 20 {
            return;
        }
        match node["type"].as_str() {
            Some("text") => {
                let text = node["text"].as_str().unwrap_or("");
                let clipped: String = text.chars().take(*left).collect();
                *left -= clipped.chars().count();
                out.push(serde_json::json!({"type":"text","text":clipped}));
            }
            Some("mention") => {
                let attrs = &node["attrs"];
                let label: String = attrs["label"]
                    .as_str()
                    .unwrap_or("Context")
                    .chars()
                    .take(160)
                    .collect();
                out.push(serde_json::json!({"type":"mention","attrs":{"id":attrs["id"],"kind":attrs["kind"],"label":label}}));
                *left = left.saturating_sub(1);
            }
            Some("hardBreak") => out.push(serde_json::json!({"type":"text","text":" "})),
            _ => {
                if let Some(children) = node["content"].as_array() {
                    for child in children {
                        if *left == 0 || out.len() >= 40 {
                            break;
                        }
                        visit(child, left, out, depth + 1);
                    }
                }
            }
        }
    }
    let mut out = Vec::new();
    visit(document, &mut 160, &mut out, 0);
    serde_json::json!({"type":"doc","content":out})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn feed_preview_is_bounded_and_keeps_atomic_identity() {
        let doc = serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"mention","attrs":{"id":"file-id","kind":"files","label":"Plan"}},{"type":"text","text":"界".repeat(500)}]}]});
        let preview = activity_preview(&doc);
        assert_eq!(preview["content"][0]["attrs"]["id"], "file-id");
        assert_eq!(
            preview["content"][1]["text"]
                .as_str()
                .unwrap()
                .chars()
                .count(),
            159
        );
        assert!(preview.to_string().len() < 1024);
    }
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
        assert_eq!(page[0].actor_member_id, org.member_id);
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
