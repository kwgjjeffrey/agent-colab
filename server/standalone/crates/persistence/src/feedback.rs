//! Markdown is the comment source of truth; YAML-derived fields are disposable indexes.
use crate::Database;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;
macro_rules! feedback_filter_sql { () => { "($2::text::timestamptz is null or captured_at>=$2::text::timestamptz) and ($3::text::timestamptz is null or captured_at<$3::text::timestamptz) and ($4::text is null or $4='all' or resolution_status=$4) and ($5::text is null or $5='all' or coalesce(rating,'unrated')=$5) and (cardinality($6::text[])=0 or case when $7='all' then not exists(select 1 from unnest($6::text[]) tag where not negative_tags @> jsonb_build_array(jsonb_build_object('tag',tag))) else exists(select 1 from unnest($6::text[]) tag where negative_tags @> jsonb_build_array(jsonb_build_object('tag',tag))) end) and ($8::uuid is null or id=$8)" }; }

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackSubmission {
    pub asset_key: String,
    pub channel_key: String,
    pub skill_version: String,
    pub consumer_agent_type: String,
    pub captured_at: String,
    pub metadata: Value,
}
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackFilter {
    pub from: Option<String>,
    pub to: Option<String>,
    pub status: Option<String>,
    pub rating: Option<String>,
    #[serde(default)]
    pub negative_tags: Vec<String>,
    pub tag_match: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
    pub asset_key: Option<String>,
    pub feedback_id: Option<Uuid>,
    pub include: Option<String>,
    pub exclude: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackComment {
    pub analysis_status: String,
    pub analysis_id: Uuid,
    pub comment_markdown: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackStatusUpdate {
    pub asset_key: String,
    pub feedback_ids: Vec<Uuid>,
    pub status: String,
    pub reason: String,
    #[serde(default)]
    pub resolution_refs: Vec<String>,
    pub expected_revisions: std::collections::HashMap<Uuid, i64>,
}

pub fn comment_index(markdown: &str) -> Value {
    // A standard Markdown parser recognizes genuine fenced blocks, including CRLF and indentation.
    let mut yaml = false;
    let mut block = String::new();
    for event in pulldown_cmark::Parser::new(markdown) {
        match event {
            pulldown_cmark::Event::Start(pulldown_cmark::Tag::CodeBlock(
                pulldown_cmark::CodeBlockKind::Fenced(info),
            )) => {
                yaml = matches!(info.trim(), "yaml" | "yml");
                block.clear();
            }
            pulldown_cmark::Event::Text(text) if yaml => block.push_str(&text),
            pulldown_cmark::Event::End(pulldown_cmark::TagEnd::CodeBlock) if yaml => {
                if let Ok(v) = serde_yaml::from_str::<Value>(&block) {
                    if matches!(v["rating"].as_str(), Some("positive" | "negative")) {
                        return json!({"parseStatus":"parsed","rating":v["rating"],"taskOutcome":if matches!(v["taskOutcome"].as_str(),Some("completed"|"progress"|"off_track_or_no_progress")){v["taskOutcome"].clone()}else{Value::Null},"positiveTags":v["positiveTags"].as_array().cloned().unwrap_or_default(),"negativeTags":v["negativeTags"].as_array().cloned().unwrap_or_default(),"taskTrajectory":v["taskTrajectory"]});
                    }
                }
                yaml = false;
            }
            _ => {}
        }
    }
    json!({"parseStatus":"unparsed","rating":null,"taskOutcome":null,"positiveTags":[],"negativeTags":[],"taskTrajectory":null})
}
impl Database {
    pub async fn configure_builtin_feedback_reviewers(
        &self,
        reviewers: &[Uuid],
    ) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        let configured:bool=sqlx::query_scalar("select exists(select 1 from feedback_managers where asset_key='builtin:agent-colab')").fetch_one(&mut *tx).await?;
        if configured { return Ok(()); }
        sqlx::query("delete from feedback_reviewers where asset_key='builtin:agent-colab'")
            .execute(&mut *tx)
            .await?;
        for id in reviewers {
            sqlx::query("insert into feedback_reviewers(asset_key,user_id) values('builtin:agent-colab',$1) on conflict do nothing").bind(id).execute(&mut *tx).await?;
        }
        sqlx::query("insert into feedback_managers select asset_key,user_id from feedback_reviewers where asset_key='builtin:agent-colab' on conflict do nothing").execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn feedback_can_manage(&self, user: Uuid, key: &str) -> anyhow::Result<bool> {
        Ok(sqlx::query_scalar("select exists(select 1 from feedback_managers where asset_key=$1 and user_id=$2) or exists(select 1 from shared_assets where 'asset:'||id::text=$1 and owner_user_id=$2 and kind='skill')").bind(key).bind(user).fetch_one(&self.pool).await?)
    }
    pub async fn list_feedback_access(&self, user: Uuid, key: &str) -> anyhow::Result<Value> {
        anyhow::ensure!(self.feedback_can_review(user,key).await?, "feedback_review_forbidden");
        let rows=sqlx::query("with grants as (select user_id,'reviewer' role from feedback_reviewers where asset_key=$1 union select user_id,'manager' role from feedback_managers where asset_key=$1 union select owner_user_id,'owner' role from shared_assets where 'asset:'||id::text=$1 and kind='skill') select u.id,u.email,coalesce(u.display_name,u.email) name,array_agg(g.role order by g.role) roles from grants g join users u on u.id=g.user_id group by u.id order by name,u.id").bind(key).fetch_all(&self.pool).await?;
        Ok(json!({"assetKey":key,"canManage":self.feedback_can_manage(user,key).await?,"members":rows.iter().map(|r|json!({"userId":r.get::<Uuid,_>("id"),"email":r.get::<String,_>("email"),"name":r.get::<String,_>("name"),"roles":r.get::<Vec<String>,_>("roles")})).collect::<Vec<_>>()}))
    }
    pub async fn update_feedback_access(&self, actor: Uuid, key: &str, email: &str, action: &str) -> anyhow::Result<Value> {
        // A reviewer cannot delegate private transcript access. Owner/manager authority is checked in the mutation transaction.
        let mut tx=self.pool.begin().await?;
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from feedback_managers where asset_key=$1 and user_id=$2) or exists(select 1 from shared_assets where 'asset:'||id::text=$1 and owner_user_id=$2 and kind='skill')").bind(key).bind(actor).fetch_one(&mut *tx).await?;
        anyhow::ensure!(allowed,"feedback_review_forbidden");
        let subject:Option<Uuid>=sqlx::query_scalar("select id from users where lower(email)=lower($1)").bind(email).fetch_optional(&mut *tx).await?;
        let subject=subject.ok_or_else(||anyhow::anyhow!("feedback_account_not_found"))?;
        let changed=if action=="grant" {sqlx::query("insert into feedback_reviewers(asset_key,user_id) values($1,$2) on conflict do nothing").bind(key).bind(subject).execute(&mut *tx).await?.rows_affected()} else {sqlx::query("delete from feedback_reviewers where asset_key=$1 and user_id=$2").bind(key).bind(subject).execute(&mut *tx).await?.rows_affected()};
        if changed>0 {sqlx::query("insert into feedback_access_events(asset_key,actor_user_id,subject_user_id,action) values($1,$2,$3,$4)").bind(key).bind(actor).bind(subject).bind(action).execute(&mut *tx).await?;}
        tx.commit().await?;
        self.list_feedback_access(actor,key).await
    }

    pub async fn feedback_can_review(&self, user: Uuid, key: &str) -> anyhow::Result<bool> {
        Ok(sqlx::query_scalar("select exists(select 1 from feedback_reviewers where asset_key=$1 and user_id=$2) or exists(select 1 from feedback_managers where asset_key=$1 and user_id=$2) or exists(select 1 from shared_assets where 'asset:'||id::text=$1 and owner_user_id=$2 and kind='skill')").bind(key).bind(user).fetch_one(&self.pool).await?)
    }
    pub async fn feedback_can_report(
        &self,
        user: Uuid,
        b: &FeedbackSubmission,
    ) -> anyhow::Result<bool> {
        if b.asset_key == "builtin:agent-colab" {
            return Ok(b.channel_key == "builtin:agent-colab");
        }
        Ok(sqlx::query_scalar("select exists(select 1 from channel_shares s join shared_assets a on a.id=s.asset_id join channel_members cm on cm.channel_id=s.channel_id join organization_members om on om.id=cm.organization_member_id where 'asset:'||a.id::text=$1 and ($2='unknown:legacy-install' or 'channel:'||s.channel_id::text=$2) and a.kind='skill' and s.state='active' and om.user_id=$3)").bind(&b.asset_key).bind(&b.channel_key).bind(user).fetch_one(&self.pool).await?)
    }
    pub async fn submit_feedback(
        &self,
        user: Uuid,
        id: Uuid,
        b: &FeedbackSubmission,
    ) -> anyhow::Result<bool> {
        let result=sqlx::query("insert into feedback_records(id,asset_key,channel_key,reporter_user_id,consumer_agent_type,skill_version,captured_at,metadata) values($1,$2,$3,$4,$5,$6,$7::text::timestamptz,$8) on conflict(id) do nothing").bind(id).bind(&b.asset_key).bind(&b.channel_key).bind(user).bind(&b.consumer_agent_type).bind(&b.skill_version).bind(&b.captured_at).bind(&b.metadata).execute(&self.pool).await?;
        if result.rows_affected() == 1 {
            return Ok(true);
        }
        Ok(sqlx::query_scalar("select exists(select 1 from feedback_records where id=$1 and reporter_user_id=$2 and asset_key=$3 and channel_key=$4 and metadata=$5)").bind(id).bind(user).bind(&b.asset_key).bind(&b.channel_key).bind(&b.metadata).fetch_one(&self.pool).await?)
    }
    pub async fn feedback_reporter(&self, user: Uuid, id: Uuid) -> anyhow::Result<bool> {
        Ok(sqlx::query_scalar(
            "select exists(select 1 from feedback_records where id=$1 and reporter_user_id=$2)",
        )
        .bind(id)
        .bind(user)
        .fetch_one(&self.pool)
        .await?)
    }
    pub async fn feedback_blob(
        &self,
        user: Uuid,
        id: Uuid,
    ) -> anyhow::Result<Option<(String, String, i64)>> {
        let row=sqlx::query("select session_blob_key,session_digest,session_byte_size,asset_key,reporter_user_id from feedback_records where id=$1 and session_blob_key is not null").bind(id).fetch_optional(&self.pool).await?;
        let Some(row) = row else { return Ok(None) };
        if row.get::<Uuid, _>("reporter_user_id") != user
            && !self
                .feedback_can_review(user, &row.get::<String, _>("asset_key"))
                .await?
        {
            return Ok(None);
        }
        Ok(Some((
            row.get("session_blob_key"),
            row.get("session_digest"),
            row.get("session_byte_size"),
        )))
    }
    pub async fn commit_feedback_blob(
        &self,
        user: Uuid,
        id: Uuid,
        key: &str,
        digest: &str,
        size: i64,
    ) -> anyhow::Result<bool> {
        Ok(sqlx::query("update feedback_records set session_blob_key=$3,session_digest=$4,session_byte_size=$5 where id=$1 and reporter_user_id=$2 and session_blob_key is null").bind(id).bind(user).bind(key).bind(digest).bind(size).execute(&self.pool).await?.rows_affected()==1)
    }
    pub async fn comment_feedback(
        &self,
        user: Uuid,
        id: Uuid,
        b: &FeedbackComment,
    ) -> anyhow::Result<bool> {
        let v = b
            .comment_markdown
            .as_deref()
            .map(comment_index)
            .unwrap_or_else(|| json!({"parseStatus":"absent","positiveTags":[],"negativeTags":[]}));
        Ok(sqlx::query("update feedback_records set analysis_status=$3,analysis_id=$4,comment_markdown=$5,comment_parse_status=$6,rating=$7,task_outcome=$8,positive_tags=$9,negative_tags=$10,task_trajectory=$11 where id=$1 and reporter_user_id=$2 and (analysis_id is null or (analysis_id=$4 and analysis_status=$3 and comment_markdown is not distinct from $5))").bind(id).bind(user).bind(&b.analysis_status).bind(b.analysis_id).bind(&b.comment_markdown).bind(v["parseStatus"].as_str()).bind(v["rating"].as_str()).bind(v["taskOutcome"].as_str()).bind(&v["positiveTags"]).bind(&v["negativeTags"]).bind(&v["taskTrajectory"]).execute(&self.pool).await?.rows_affected()==1)
    }
    pub async fn list_feedbacks(&self, user: Uuid, f: &FeedbackFilter) -> anyhow::Result<Value> {
        let key = f.asset_key.as_deref().unwrap_or("");
        anyhow::ensure!(
            self.feedback_can_review(user, key).await?,
            "feedback_review_forbidden"
        );
        let count: i64 = bind_filter(
            sqlx::query_scalar(concat!(
                "select count(*) from feedback_records f where asset_key=$1 and ",
                feedback_filter_sql!()
            )),
            key,
            f,
        )
        .fetch_one(&self.pool)
        .await?;
        let cursor = if let Some(id) = &f.cursor {
            Some(Uuid::parse_str(id)?)
        } else {
            None
        };
        let sql = concat!(
            "select jsonb_build_object('feedbackId',id,'assetKey',asset_key,'channelKey',channel_key,'status',resolution_status,'statusRevision',status_revision,'analysisStatus',analysis_status,'evidenceAvailable',session_blob_key is not null,'sessionRef','colab://feedback/'||id::text||'/session','capturedAt',captured_at,'rating',coalesce(rating,'unrated'),'taskOutcome',task_outcome,'positiveTags',positive_tags,'negativeTags',negative_tags,'taskTrajectory',task_trajectory,'comment',comment_markdown,'metadata',metadata,'reporterUserId',reporter_user_id,'consumerAgentType',consumer_agent_type,'skillVersion',skill_version) value from feedback_records f where asset_key=$1 and ",
            feedback_filter_sql!(),
            " and ($9::uuid is null or (captured_at,id)<(select captured_at,id from feedback_records where id=$9 and asset_key=$1)) order by captured_at desc,id desc limit $10"
        );
        let limit = f.limit.unwrap_or(20);
        let rows = bind_filter_rows(sqlx::query(sql), key, f)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(&self.pool)
            .await?;
        let mut values: Vec<Value> = rows.into_iter().map(|r| r.get("value")).collect();
        let more = values.len() > limit as usize;
        values.truncate(limit as usize);
        Ok(
            json!({"items":values.iter().map(|v|project(v,f)).collect::<Vec<_>>(),"totalMatching":count,"nextCursor":if more{values.last().map(|v|v["feedbackId"].clone())}else{None}}),
        )
    }
    pub async fn list_feedback_assets(
        &self,
        user: Uuid,
        f: &FeedbackFilter,
    ) -> anyhow::Result<Value> {
        let sql = concat!(
            "with owned as (select 'asset:'||id::text asset_key,name from shared_assets where owner_user_id=$9 and kind='skill' union select asset_key,'Agent Colab' name from feedback_managers where user_id=$9 union select r.asset_key,case when r.asset_key='builtin:agent-colab' then 'Agent Colab' else coalesce(a.name,r.asset_key) end from feedback_reviewers r left join shared_assets a on 'asset:'||a.id::text=r.asset_key where r.user_id=$9), matched as (select * from feedback_records f where ",
            feedback_filter_sql!(),
            ") select o.asset_key,o.name,(select count(*) from feedback_records where asset_key=o.asset_key) total,count(m.id) matching,count(m.id) filter(where rating='positive') positive,count(m.id) filter(where rating='negative') negative,count(m.id) filter(where rating is null) unrated,count(m.id) filter(where resolution_status='resolved') resolved,count(m.id) filter(where resolution_status='unresolved') unresolved,count(m.id) filter(where resolution_status='ignored') ignored from owned o left join matched m on m.asset_key=o.asset_key where $1::text='' and ($10::text is null or o.asset_key>$10) group by o.asset_key,o.name order by o.asset_key limit $11"
        );
        let limit = f.limit.unwrap_or(20);
        let rows = bind_filter_rows(sqlx::query(sql), "", f)
            .bind(user)
            .bind(&f.cursor)
            .bind(limit + 1)
            .fetch_all(&self.pool)
            .await?;
        let more = rows.len() > limit as usize;
        let mut items = vec![];
        for r in rows.into_iter().take(limit as usize) {
            items.push(json!({"assetKey":r.get::<String,_>("asset_key"),"name":r.get::<String,_>("name"),"stats":{"totalFeedbacks":r.get::<i64,_>("total"),"matchingFeedbacks":r.get::<i64,_>("matching"),"ratingCounts":{"positive":r.get::<i64,_>("positive"),"negative":r.get::<i64,_>("negative"),"unrated":r.get::<i64,_>("unrated")},"statusCounts":{"resolved":r.get::<i64,_>("resolved"),"unresolved":r.get::<i64,_>("unresolved"),"ignored":r.get::<i64,_>("ignored")}}}));
        }
        let as_of: String = sqlx::query_scalar("select now()::text")
            .fetch_one(&self.pool)
            .await?;
        Ok(
            json!({"items":items,"nextCursor":if more{items.last().map(|v|v["assetKey"].clone())}else{None},"asOf":as_of}),
        )
    }
    pub async fn update_feedback_status(
        &self,
        user: Uuid,
        b: &FeedbackStatusUpdate,
    ) -> anyhow::Result<Value> {
        anyhow::ensure!(
            self.feedback_can_review(user, &b.asset_key).await?,
            "feedback_review_forbidden"
        );
        let mut tx = self.pool.begin().await?;
        let mut items = vec![];
        // All IDs must belong to this asset, and all revisions must match before any commit.
        let mut ids = b.feedback_ids.clone();
        ids.sort();
        ids.dedup();
        for id in ids {
            let row=sqlx::query("select resolution_status,status_revision from feedback_records where id=$1 and asset_key=$2 for update").bind(id).bind(&b.asset_key).fetch_optional(&mut *tx).await?.ok_or_else(||anyhow::anyhow!("feedback_scope_mismatch"))?;
            let revision: i64 = row.get("status_revision");
            anyhow::ensure!(
                b.expected_revisions.get(&id) == Some(&revision),
                "feedback_revision_conflict"
            );
            sqlx::query("insert into feedback_status_history(feedback_id,revision,actor_user_id,previous_status,status,reason,resolution_refs) values($1,$2,$3,$4,$5,$6,$7)").bind(id).bind(revision+1).bind(user).bind(row.get::<String,_>("resolution_status")).bind(&b.status).bind(&b.reason).bind(json!(b.resolution_refs)).execute(&mut *tx).await?;
            sqlx::query("update feedback_records set resolution_status=$2,status_revision=status_revision+1 where id=$1").bind(id).bind(&b.status).execute(&mut *tx).await?;
            items.push(json!({"feedbackId":id,"status":b.status,"statusRevision":revision+1}));
        }
        tx.commit().await?;
        Ok(json!({"assetKey":b.asset_key,"updatedCount":items.len(),"items":items}))
    }
}
fn bind_filter_rows<'a>(
    q: sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>,
    key: &'a str,
    f: &'a FeedbackFilter,
) -> sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments> {
    q.bind(key)
        .bind(&f.from)
        .bind(&f.to)
        .bind(&f.status)
        .bind(&f.rating)
        .bind(&f.negative_tags)
        .bind(&f.tag_match)
        .bind(f.feedback_id)
}
fn bind_filter<'a>(
    q: sqlx::query::QueryScalar<'a, sqlx::Postgres, i64, sqlx::postgres::PgArguments>,
    key: &'a str,
    f: &'a FeedbackFilter,
) -> sqlx::query::QueryScalar<'a, sqlx::Postgres, i64, sqlx::postgres::PgArguments> {
    q.bind(key)
        .bind(&f.from)
        .bind(&f.to)
        .bind(&f.status)
        .bind(&f.rating)
        .bind(&f.negative_tags)
        .bind(&f.tag_match)
        .bind(f.feedback_id)
}
fn project(v: &Value, f: &FeedbackFilter) -> Value {
    let mut out = json!({});
    for key in [
        "feedbackId",
        "assetKey",
        "status",
        "statusRevision",
        "analysisStatus",
        "evidenceAvailable",
        "sessionRef",
    ] {
        out[key] = v[key].clone()
    }
    for field in f
        .include
        .as_deref()
        .unwrap_or("metadata,rating,tags,taskOutcome")
        .split(',')
        .filter(|field| {
            !f.exclude
                .as_deref()
                .unwrap_or("")
                .split(',')
                .any(|x| x == *field)
        })
    {
        let keys: &[&str] = match field {
            "metadata" => &[
                "metadata",
                "capturedAt",
                "channelKey",
                "reporterUserId",
                "consumerAgentType",
                "skillVersion",
            ],
            "tags" => &["positiveTags", "negativeTags"],
            "rating" => &["rating"],
            "taskOutcome" => &["taskOutcome"],
            "taskTrajectory" => &["taskTrajectory"],
            "comment" => &["comment"],
            _ => &[],
        };
        for key in keys {
            out[*key] = v[*key].clone()
        }
    }
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_flexible_yaml() {
        let v = comment_index(
            "text\n```yaml\nrating: negative\ntaskOutcome: progress\nnegativeTags:\n - tag: 新问题\n   evidence: 任意说明\ntaskTrajectory:\n inefficient:\n  - 第2轮重复读取\n```\nmore",
        );
        assert_eq!(v["rating"], "negative");
        assert_eq!(v["negativeTags"][0]["tag"], "新问题");
    }
    #[test]
    fn invalid_comment_stays_unrated() {
        assert_eq!(comment_index("plain prose")["parseStatus"], "unparsed");
        assert!(comment_index("```yaml\nrating: up\n```")["rating"].is_null());
    }
}
#[cfg(test)]
mod database_tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires isolated COLAB_FEEDBACK_TEST_DATABASE_URL"]
    async fn feedback_owner_scope_filters_and_atomic_resolution() -> anyhow::Result<()> {
        let db = Database::connect(&std::env::var("COLAB_FEEDBACK_TEST_DATABASE_URL")?, 4).await?;
        let owner = Uuid::new_v4();
        let reporter = Uuid::new_v4();
        let outsider = Uuid::new_v4();
        for id in [owner, reporter, outsider] {
            sqlx::query("insert into users(id,email) values($1,$2)")
                .bind(id)
                .bind(format!("{id}@feedback.invalid"))
                .execute(&db.pool)
                .await?;
        }
        let org = db.create_organization(owner, "Feedback test").await?;
        let channel = db.create_channel(owner, org.id, "Feedback", None).await?;
        let member = Uuid::new_v4();
        sqlx::query("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$3,'member')").bind(member).bind(org.id).bind(reporter).execute(&db.pool).await?;
        sqlx::query("insert into channel_members(channel_id,organization_id,organization_member_id,role) values($1,$2,$3,'member')").bind(channel.id).bind(org.id).bind(member).execute(&db.pool).await?;
        let asset = db
            .register_asset(
                owner,
                channel.id,
                &crate::RegisterAsset {
                    kind: "skill".into(),
                    name: "Test Skill".into(),
                    description: None,
                    source_adapter: "shadow-git-v1".into(),
                    source_key: Uuid::new_v4().simple().to_string().repeat(2),
                    existing_share_ids: vec![],
                },
            )
            .await?
            .unwrap();
        let owned_key = format!("asset:{}", asset.asset_id);
        let key = owned_key.as_str();
        sqlx::query("insert into feedback_reviewers values($1,$2)")
            .bind(key)
            .bind(owner)
            .execute(&db.pool)
            .await?;
        assert!(db.feedback_can_manage(owner,key).await?);
        assert!(db.list_feedback_access(outsider,key).await.is_err());
        let outsider_email=format!("{outsider}@feedback.invalid");
        let access=db.update_feedback_access(owner,key,&outsider_email,"grant").await?;
        assert!(access["canManage"].as_bool().unwrap());
        assert!(db.feedback_can_review(outsider,key).await?);
        assert!(!db.feedback_can_manage(outsider,key).await?);
        assert!(db.update_feedback_access(outsider,key,&format!("{reporter}@feedback.invalid"),"grant").await.is_err());
        db.update_feedback_access(owner,key,&outsider_email,"revoke").await?;
        assert!(!db.feedback_can_review(outsider,key).await?);
        assert!(db.update_feedback_access(owner,key,"missing@feedback.invalid","grant").await.is_err());
        let b = FeedbackSubmission {
            asset_key: key.into(),
            channel_key: format!("channel:{}", channel.id),
            skill_version: "trial".into(),
            consumer_agent_type: "codex".into(),
            captured_at: "2026-10-10T12:00:00+08:00".into(),
            metadata: json!({"turnId":"trial"}),
        };
        let a = Uuid::new_v4();
        let c = Uuid::new_v4();
        assert!(db.feedback_can_report(reporter, &b).await?);
        assert!(db.submit_feedback(reporter, a, &b).await?);
        assert!(db.submit_feedback(reporter, a, &b).await?);
        assert!(!db.submit_feedback(outsider, a, &b).await?);
        assert!(db.submit_feedback(reporter, c, &b).await?);
        let comment=FeedbackComment{analysis_status:"completed".into(),analysis_id:Uuid::new_v4(),comment_markdown:Some("```yaml\nrating: negative\ntaskOutcome: progress\nnegativeTags:\n - tag: 说明不清\n   evidence: 实际命令失败\n```\n## 自由说明\n保留全文".into())};
        assert!(!db.comment_feedback(outsider, a, &comment).await?);
        assert!(db.comment_feedback(reporter, a, &comment).await?);
        let f = FeedbackFilter {
            asset_key: Some(key.into()),
            negative_tags: vec!["说明不清".into()],
            from: Some("2026-10-10T03:00:00Z".into()),
            to: Some("2026-10-10T05:00:00Z".into()),
            include: Some("rating,tags,comment".into()),
            ..Default::default()
        };
        assert!(db.list_feedbacks(outsider, &f).await.is_err());
        let page = db.list_feedbacks(owner, &f).await?;
        assert_eq!(page["totalMatching"], 1);
        assert!(
            page["items"][0]["comment"]
                .as_str()
                .unwrap()
                .contains("自由说明")
        );
        let zero = db
            .register_asset(
                owner,
                channel.id,
                &crate::RegisterAsset {
                    kind: "skill".into(),
                    name: "No feedback".into(),
                    description: None,
                    source_adapter: "shadow-git-v1".into(),
                    source_key: Uuid::new_v4().simple().to_string().repeat(2),
                    existing_share_ids: vec![],
                },
            )
            .await?
            .unwrap();
        let stats = db.list_feedback_assets(owner, &f).await?;
        let values = stats["items"].as_array().unwrap();
        let counted = values.iter().find(|v| v["assetKey"] == key).unwrap();
        assert_eq!(counted["stats"]["totalFeedbacks"], 2);
        assert_eq!(counted["stats"]["ratingCounts"]["negative"], 1);
        let empty = values
            .iter()
            .find(|v| v["assetKey"] == format!("asset:{}", zero.asset_id))
            .unwrap();
        assert_eq!(empty["stats"]["matchingFeedbacks"], 0);
        let mut update = FeedbackStatusUpdate {
            asset_key: key.into(),
            feedback_ids: vec![a, c],
            status: "resolved".into(),
            reason: "修复并验证".into(),
            resolution_refs: vec!["trial:verified".into()],
            expected_revisions: std::collections::HashMap::from([(a, 0), (c, 1)]),
        };
        assert!(db.update_feedback_status(owner, &update).await.is_err());
        let status: String =
            sqlx::query_scalar("select resolution_status from feedback_records where id=$1")
                .bind(a)
                .fetch_one(&db.pool)
                .await?;
        assert_eq!(status, "unresolved");
        update.expected_revisions.insert(c, 0);
        assert_eq!(
            db.update_feedback_status(owner, &update).await?["updatedCount"],
            2
        );
        assert!(db.update_feedback_status(owner, &update).await.is_err());
        assert!(
            db.commit_feedback_blob(reporter, a, "test-feedback-evidence", "digest", 5)
                .await?
        );
        assert!(
            db.referenced_blob_keys()
                .await?
                .contains(&"test-feedback-evidence".into())
        );
        assert!(db.feedback_blob(outsider, a).await?.is_none());
        assert!(db.feedback_blob(owner, a).await?.is_some());
        let all = FeedbackFilter {
            asset_key: Some(key.into()),
            limit: Some(1),
            ..Default::default()
        };
        let first = db.list_feedbacks(owner, &all).await?;
        let second = db
            .list_feedbacks(
                owner,
                &FeedbackFilter {
                    cursor: first["nextCursor"].as_str().map(str::to_owned),
                    ..all
                },
            )
            .await?;
        assert_ne!(
            first["items"][0]["feedbackId"],
            second["items"][0]["feedbackId"]
        );
        Ok(())
    }
}
