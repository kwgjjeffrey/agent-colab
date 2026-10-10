use super::*;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AgentBlueprint {
    pub id: Uuid,
    pub owner_member_id: Uuid,
    pub owner_name: String,
    pub owner_avatar_url: Option<String>,
    pub name: String,
    pub loading_instruction: String,
    pub loading_command: String,
    pub runtime_device: Option<String>,
    pub runtime_agent: Option<String>,
    pub runtime_id: Option<Uuid>,
    pub runtime_label: Option<String>,
    pub invocation_policy: String,
    pub in_channel: bool,
    pub editable: bool,
    pub updated_at: String,
}

fn request_reply_content(
    requester_member_id: Uuid,
    requester_name: &str,
    body: &str,
) -> (String, serde_json::Value) {
    (
        format!("@{requester_name} {body}"),
        serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[
            {"type":"mention","attrs":{"id":requester_member_id,"label":requester_name,"kind":"member"}},
            {"type":"text","text":format!(" {body}")}
        ]}]}),
    )
}

#[cfg(test)]
mod tests {
    use super::request_reply_content;
    use uuid::Uuid;

    #[test]
    fn request_reply_addresses_the_author_with_a_structured_member_mention() {
        let member = Uuid::new_v4();
        let (body, content) = request_reply_content(member, "Zhiyuan Yu", "done");
        assert_eq!(body, "@Zhiyuan Yu done");
        assert_eq!(
            content["content"][0]["content"][0]["attrs"]["id"],
            member.to_string()
        );
        assert_eq!(
            content["content"][0]["content"][0]["attrs"]["kind"],
            "member"
        );
        assert_eq!(content["content"][0]["content"][1]["text"], " done");
    }
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntime {
    pub id: Uuid,
    pub device_id: Uuid,
    pub device_name: String,
    pub provider: String,
    pub skill_version: String,
    pub available: bool,
    pub last_seen_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChannelParticipant {
    pub member_id: Uuid,
    pub username: Option<String>,
    pub display_name: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub is_current: bool,
    pub agent_count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMessage {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub seq: i64,
    pub body: String,
    pub content: serde_json::Value,
    pub reply_to_message_id: Option<Uuid>,
    pub sender_member_id: Option<Uuid>,
    pub sender_blueprint_id: Option<Uuid>,
    pub sender_name: String,
    pub sender_avatar_url: Option<String>,
    pub sender_kind: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRequestBundle {
    #[serde(skip)]
    pub request_owner_instruction: bool,
    pub trace_context: Option<serde_json::Value>,
    pub id: Uuid,
    pub channel_id: Uuid,
    pub target_blueprint_id: Uuid,
    pub target_name: String,
    pub target_owner_member_id: Uuid,
    pub target_owner_name: String,
    pub requester_name: String,
    pub instruction: String,
    pub runtime_id: Uuid,
    pub kind: String,
    pub query: String,
    pub before_seq: Option<i64>,
    pub state: String,
    pub messages: Vec<ChannelMessage>,
    pub quote_messages: Vec<ChannelMessage>,
}

// Ask me first differs from Refuse only in its automatic reply. It is not an
// approval lease: an owner's later mention creates an independent instruction.
fn invocation_state(is_owner: bool, policy: &str) -> &'static str {
    if is_owner || policy == "process" { "queued" } else { "rejected" }
}

#[cfg(test)]
mod invocation_policy_tests {
    use super::invocation_state;

    #[test]
    fn ask_and_refuse_are_terminal_for_non_owners() {
        for policy in ["awaiting_owner", "refuse"] {
            assert_eq!(invocation_state(false, policy), "rejected");
            assert_eq!(invocation_state(true, policy), "queued");
        }
        assert_eq!(invocation_state(false, "process"), "queued");
    }
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AgentRequestStatus {
    pub trace_context: Option<serde_json::Value>,
    pub id: Uuid,
    pub state: String,
    pub trigger_message_id: Option<Uuid>,
    pub target_blueprint_id: Uuid,
    pub target_name: String,
    pub source_canvas_id: Option<Uuid>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRequestWorkDetails {
    pub request_id: Uuid,
    pub state: String,
    pub target_name: String,
    pub events: Vec<serde_json::Value>,
}

impl Database {
    pub async fn forward_source_valid(&self, user: Uuid, channel: Uuid, target: Uuid, messages: &[Uuid]) -> anyhow::Result<bool> {
        if self.channel_actor(user, channel).await?.is_none() { return Ok(false); }
        let target_valid: bool = sqlx::query_scalar("select exists(select 1 from channel_agents ca join agent_blueprints ab on ab.id=ca.blueprint_id where ca.channel_id=$1 and ab.id=$2 and ab.runtime_id is not null and ab.deleted_at is null)").bind(channel).bind(target).fetch_one(&self.pool).await?;
        let count: i64 = sqlx::query_scalar("select count(*) from channel_messages where channel_id=$1 and id=any($2)").bind(channel).bind(messages).fetch_one(&self.pool).await?;
        Ok(target_valid && count as usize == messages.len() && messages.len() <= 100)
    }
    pub async fn context_reference_label(&self, channel: Uuid, kind: &str, id: Uuid) -> anyhow::Result<Option<String>> {
        let query = match kind {
            "files" | "session" | "skill" => "select name from channel_shares where id=$1 and channel_id=$2 and kind=$3 and state='active'",
            "canvas" => "select title from canvases where id=$1 and channel_id=$2 and archived_at is null and $3='canvas'",
            "message" => "select 'Message '||seq::text from channel_messages where id=$1 and channel_id=$2 and $3='message'",
            _ => return Ok(None),
        };
        Ok(sqlx::query_scalar(query).bind(id).bind(channel).bind(kind).fetch_optional(&self.pool).await?)
    }
    /// References carry stable product identities and never grant access by themselves.
    pub async fn context_reference_visible(&self, user: Uuid, channel: Uuid, kind: &str, id: Uuid) -> anyhow::Result<bool> {
        if self.channel_actor(user, channel).await?.is_none() { return Ok(false); }
        let query = match kind {
            "files" | "session" | "skill" => "select exists(select 1 from channel_shares where id=$1 and channel_id=$2 and kind=$3 and state='active')",
            "canvas" => "select exists(select 1 from canvases where id=$1 and channel_id=$2 and archived_at is null and $3='canvas')",
            "message" => "select exists(select 1 from channel_messages where id=$1 and channel_id=$2 and $3='message')",
            _ => return Ok(false),
        };
        Ok(sqlx::query_scalar(query).bind(id).bind(channel).bind(kind).fetch_one(&self.pool).await?)
    }
    async fn reply_chain(
        &self,
        channel_id: Uuid,
        message_id: Uuid,
    ) -> anyhow::Result<Vec<ChannelMessage>> {
Ok(sqlx::query_as::<_,ChannelMessage>("with recursive chain(id,reply_to_message_id,depth) as (select parent.id,parent.reply_to_message_id,1 from channel_messages current join channel_messages parent on parent.id=current.reply_to_message_id where current.id=$1 and current.channel_id=$2 union all select parent.id,parent.reply_to_message_id,chain.depth+1 from chain join channel_messages parent on parent.id=chain.reply_to_message_id where chain.depth<50) select m.id,m.channel_id,m.seq,m.body,m.content,m.reply_to_message_id,m.sender_member_id,m.sender_blueprint_id,coalesce(u.display_name,u.email,ab.name) sender_name,coalesce(u.avatar_url,au.avatar_url) sender_avatar_url,case when m.sender_blueprint_id is null then 'member' else 'agent' end::text sender_kind,m.created_at::text created_at from chain join channel_messages m on m.id=chain.id left join organization_members om on om.id=m.sender_member_id left join users u on u.id=om.user_id left join agent_blueprints ab on ab.id=m.sender_blueprint_id left join organization_members aom on aom.id=ab.owner_member_id left join users au on au.id=aom.user_id order by chain.depth desc").bind(message_id).bind(channel_id).fetch_all(&self.pool).await?)
    }

    pub(crate) async fn channel_actor(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<(Uuid, Uuid)>> {
        sqlx::query_as("select om.id,c.organization_id from channel_members cm join organization_members om on om.id=cm.organization_member_id join channels c on c.id=cm.channel_id where cm.channel_id=$1 and om.user_id=$2")
            .bind(channel_id).bind(user_id).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    pub async fn list_channel_participants(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<ChannelParticipant>>> {
        if self.channel_actor(user_id, channel_id).await?.is_none() {
            return Ok(None);
        }
        let rows = sqlx::query_as::<_, ChannelParticipant>(
            "select om.id member_id,(select subject from auth_identities i where i.user_id=u.id and i.provider=$3) username,coalesce(u.display_name,u.email) display_name,u.email,u.avatar_url,(u.id=$2) is_current,count(ca.blueprint_id)::bigint agent_count from channel_members cm join organization_members om on om.id=cm.organization_member_id join users u on u.id=om.user_id left join agent_blueprints ab on ab.owner_member_id=om.id left join channel_agents ca on ca.blueprint_id=ab.id and ca.channel_id=cm.channel_id where cm.channel_id=$1 group by om.id,u.id,u.display_name,u.email,u.avatar_url order by (u.id=$2) desc,coalesce(u.display_name,u.email)"
        ).bind(channel_id).bind(user_id).bind(self.external_policy.as_ref().map(|p| p.provider.as_str())).fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }

    pub async fn list_blueprints(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        owner_member_id: Option<Uuid>,
    ) -> anyhow::Result<Option<Vec<AgentBlueprint>>> {
        let Some((actor_member, organization_id)) = self.channel_actor(user_id, channel_id).await?
        else {
            return Ok(None);
        };
        let owner = owner_member_id.unwrap_or(actor_member);
        let rows = sqlx::query_as::<_, AgentBlueprint>(
            "select ab.id,ab.owner_member_id,coalesce(u.display_name,u.email) owner_name,u.avatar_url owner_avatar_url,ab.name,ab.loading_instruction,ab.loading_command,ab.runtime_device,ab.runtime_agent,ab.runtime_id,case when ar.id is null then null else ar.device_name||' · '||initcap(ar.provider) end runtime_label,ab.invocation_policy,(ca.blueprint_id is not null) in_channel,(ab.owner_member_id=$3) editable,ab.updated_at::text updated_at from agent_blueprints ab join organization_members om on om.id=ab.owner_member_id join users u on u.id=om.user_id left join agent_runtimes ar on ar.id=ab.runtime_id left join channel_agents ca on ca.blueprint_id=ab.id and ca.channel_id=$1 where ab.organization_id=$2 and ab.owner_member_id=$4 and ab.deleted_at is null order by ab.updated_at desc"
        ).bind(channel_id).bind(organization_id).bind(actor_member).bind(owner).fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }

    pub async fn create_blueprint(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        name: &str,
        instruction: &str,
        command: &str,
        runtime_id: Uuid,
        policy: &str,
    ) -> anyhow::Result<Option<AgentBlueprint>> {
        let Some((member_id, organization_id)) = self.channel_actor(user_id, channel_id).await?
        else {
            return Ok(None);
        };
        let id = Uuid::new_v4();
        let inserted = sqlx::query("insert into agent_blueprints(id,organization_id,owner_member_id,name,loading_instruction,loading_command,runtime_id,runtime_device,runtime_agent,invocation_policy) select $1,$2,$3,$4,$5,$6,ar.id,ar.device_name,ar.provider,$8 from agent_runtimes ar where ar.id=$7 and ar.owner_member_id=$3 and ar.available and ar.provider='codex'")
            .bind(id).bind(organization_id).bind(member_id).bind(name).bind(instruction).bind(command).bind(runtime_id).bind(policy).execute(&self.pool).await?.rows_affected();
        if inserted != 1 {
            return Ok(None);
        }
        Ok(self
            .list_blueprints(user_id, channel_id, Some(member_id))
            .await?
            .and_then(|items| items.into_iter().find(|item| item.id == id)))
    }

    pub async fn list_runtimes(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<AgentRuntime>>> {
        let Some((member_id, _)) = self.channel_actor(user_id, channel_id).await? else {
            return Ok(None);
        };
        Ok(Some(sqlx::query_as("select id,device_id,device_name,provider,skill_version,available,last_seen_at::text last_seen_at from agent_runtimes where owner_member_id=$1 order by available desc,last_seen_at desc")
            .bind(member_id).fetch_all(&self.pool).await?))
    }

    pub async fn register_runtime(
        &self,
        user_id: Uuid,
        organization_id: Uuid,
        device_id: Uuid,
        device_name: &str,
        provider: &str,
        skill_version: &str,
        available: bool,
    ) -> anyhow::Result<Option<AgentRuntime>> {
        let member: Option<Uuid> = sqlx::query_scalar(
            "select id from organization_members where organization_id=$1 and user_id=$2",
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(member) = member else {
            return Ok(None);
        };
        let id:Uuid=sqlx::query_scalar("insert into agent_runtimes(id,organization_id,owner_member_id,device_id,device_name,provider,skill_version,available) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(owner_member_id,device_id,provider) do update set device_name=excluded.device_name,skill_version=excluded.skill_version,available=excluded.available,last_seen_at=now() returning id")
            .bind(Uuid::new_v4()).bind(organization_id).bind(member).bind(device_id).bind(device_name).bind(provider).bind(skill_version).bind(available).fetch_one(&self.pool).await?;
        Ok(sqlx::query_as("select id,device_id,device_name,provider,skill_version,available,last_seen_at::text last_seen_at from agent_runtimes where id=$1").bind(id).fetch_optional(&self.pool).await?)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_blueprint(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        id: Uuid,
        name: &str,
        instruction: &str,
        command: &str,
        runtime_device: Option<&str>,
        runtime_agent: Option<&str>,
        runtime_id: Uuid,
        policy: &str,
    ) -> anyhow::Result<Option<AgentBlueprint>> {
        let Some((member_id, _)) = self.channel_actor(user_id, channel_id).await? else {
            return Ok(None);
        };
        let updated:Option<Uuid>=sqlx::query_scalar("update agent_blueprints set name=$4,loading_instruction=$5,loading_command=$6,runtime_device=$7,runtime_agent=$8,runtime_id=$9,invocation_policy=$10,updated_at=now() where id=$1 and owner_member_id=$2 and deleted_at is null and organization_id=(select organization_id from channels where id=$3) and exists(select 1 from agent_runtimes ar where ar.id=$9 and ar.owner_member_id=$2 and ar.available and ar.provider='codex') returning id")
            .bind(id).bind(member_id).bind(channel_id).bind(name).bind(instruction).bind(command).bind(runtime_device).bind(runtime_agent).bind(runtime_id).bind(policy).fetch_optional(&self.pool).await?;
        if updated.is_none() {
            return Ok(None);
        }
        Ok(self
            .list_blueprints(user_id, channel_id, Some(member_id))
            .await?
            .and_then(|items| items.into_iter().find(|item| item.id == id)))
    }

    pub async fn set_blueprint_channel(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        id: Uuid,
        enabled: bool,
    ) -> anyhow::Result<bool> {
        let Some((member_id, _)) = self.channel_actor(user_id, channel_id).await? else {
            return Ok(false);
        };
        let owned: bool = sqlx::query_scalar(
            "select exists(select 1 from agent_blueprints where id=$1 and owner_member_id=$2 and deleted_at is null)",
        )
        .bind(id)
        .bind(member_id)
        .fetch_one(&self.pool)
        .await?;
        if !owned {
            return Ok(false);
        }
        if enabled {
            sqlx::query("insert into channel_agents(channel_id,blueprint_id,added_by_member_id) values($1,$2,$3) on conflict do nothing").bind(channel_id).bind(id).bind(member_id).execute(&self.pool).await?;
        } else {
            sqlx::query("delete from channel_agents where channel_id=$1 and blueprint_id=$2")
                .bind(channel_id)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        Ok(true)
    }

    pub async fn delete_blueprint(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        id: Uuid,
    ) -> anyhow::Result<bool> {
        let Some((member_id, organization_id)) = self.channel_actor(user_id, channel_id).await?
        else {
            return Ok(false);
        };
        let mut tx = self.pool.begin().await?;
        // Deletion retires configuration, not messages or completed request evidence.
        let affected = sqlx::query("update agent_blueprints set deleted_at=now(),updated_at=now() where id=$1 and owner_member_id=$2 and organization_id=$3 and deleted_at is null")
            .bind(id).bind(member_id).bind(organization_id).execute(&mut *tx).await?.rows_affected();
        if affected == 1 {
            sqlx::query("delete from channel_agents where blueprint_id=$1").bind(id).execute(&mut *tx).await?;
            sqlx::query("update agent_requests set state='failed' where target_blueprint_id=$1 and state='queued'").bind(id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(affected == 1)
    }

    pub async fn list_messages(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        after: i64,
        limit: i64,
    ) -> anyhow::Result<Option<Vec<ChannelMessage>>> {
        if self.channel_actor(user_id, channel_id).await?.is_none() {
            return Ok(None);
        }
        let rows=sqlx::query_as::<_,ChannelMessage>("select m.id,m.channel_id,m.seq,m.body,m.content,m.reply_to_message_id,m.sender_member_id,m.sender_blueprint_id,coalesce(u.display_name,u.email,ab.name) sender_name,coalesce(u.avatar_url,au.avatar_url) sender_avatar_url,case when m.sender_blueprint_id is null then 'member' else 'agent' end::text sender_kind,m.created_at::text created_at from channel_messages m left join organization_members om on om.id=m.sender_member_id left join users u on u.id=om.user_id left join agent_blueprints ab on ab.id=m.sender_blueprint_id left join organization_members aom on aom.id=ab.owner_member_id left join users au on au.id=aom.user_id where m.channel_id=$1 and m.seq>$2 order by m.seq asc limit $3").bind(channel_id).bind(after).bind(limit).fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }

    /// Reverse keyset query uses the existing (channel_id, seq) index. Return chronological
    /// rows to preserve the client contract; realtime catch-up keeps its forward cursor.
    pub async fn list_messages_before(&self, user: Uuid, channel: Uuid, before: i64, limit: i64) -> anyhow::Result<Option<Vec<ChannelMessage>>> {
        if self.channel_actor(user, channel).await?.is_none() { return Ok(None); }
        let mut rows = sqlx::query_as::<_,ChannelMessage>("select m.id,m.channel_id,m.seq,m.body,m.content,m.reply_to_message_id,m.sender_member_id,m.sender_blueprint_id,coalesce(u.display_name,u.email,ab.name) sender_name,coalesce(u.avatar_url,au.avatar_url) sender_avatar_url,case when m.sender_blueprint_id is null then 'member' else 'agent' end::text sender_kind,m.created_at::text created_at from channel_messages m left join organization_members om on om.id=m.sender_member_id left join users u on u.id=om.user_id left join agent_blueprints ab on ab.id=m.sender_blueprint_id left join organization_members aom on aom.id=ab.owner_member_id left join users au on au.id=aom.user_id where m.channel_id=$1 and m.seq<$2 order by m.seq desc limit $3")
            .bind(channel).bind(before).bind(limit.clamp(1,200)).fetch_all(&self.pool).await?;
        rows.reverse();
        Ok(Some(rows))
    }

    pub async fn message_by_id(&self, user: Uuid, channel: Uuid, id: Uuid) -> anyhow::Result<Option<ChannelMessage>> {
        if self.channel_actor(user, channel).await?.is_none() { return Ok(None); }
        let seq: Option<i64> = sqlx::query_scalar("select seq from channel_messages where id=$1 and channel_id=$2").bind(id).bind(channel).fetch_optional(&self.pool).await?;
        let Some(seq) = seq else { return Ok(None); };
        Ok(self.list_messages(user, channel, seq - 1, 1).await?.and_then(|mut rows| rows.pop()))
    }

    pub async fn create_message(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        body: &str,
        content: &serde_json::Value,
        reply: Option<Uuid>,
        nonce: Uuid,
    ) -> anyhow::Result<Option<ChannelMessage>> {
        let Some((member_id, _)) = self.channel_actor(user_id, channel_id).await? else {
            return Ok(None);
        };
        let id = Uuid::new_v4();
        sqlx::query("insert into channel_messages(id,channel_id,sender_member_id,body,content,reply_to_message_id,client_nonce) values($1,$2,$3,$4,$5,$6,$7) on conflict(channel_id,client_nonce) do nothing")
            .bind(id).bind(channel_id).bind(member_id).bind(body).bind(content).bind(reply).bind(nonce).execute(&self.pool).await?;
        let seq: Option<i64> = sqlx::query_scalar(
            "select seq from channel_messages where channel_id=$1 and client_nonce=$2",
        )
        .bind(channel_id)
        .bind(nonce)
        .fetch_optional(&self.pool)
        .await?;
        let Some(seq) = seq else { return Ok(None) };
        Ok(self
            .list_messages(user_id, channel_id, seq - 1, 1)
            .await?
            .and_then(|mut rows| rows.pop()))
    }

    pub async fn create_agent_request(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        target: Uuid,
        trigger: Option<Uuid>,
        forwarded: &[Uuid],
        explicit_query: Option<&str>,
        trace_context: Option<&serde_json::Value>,
    ) -> anyhow::Result<Option<AgentRequestBundle>> {
        let Some((requester, _)) = self.channel_actor(user_id, channel_id).await? else {
            return Ok(None);
        };
        let target_row:Option<(String,Uuid,String,Option<Uuid>,String,String)>=sqlx::query_as("select ab.name,ab.owner_member_id,coalesce(owner.display_name,owner.email),ab.runtime_id,ab.invocation_policy,ab.loading_instruction from agent_blueprints ab join channel_agents ca on ca.blueprint_id=ab.id join organization_members oom on oom.id=ab.owner_member_id join users owner on owner.id=oom.user_id where ab.id=$1 and ca.channel_id=$2 and ab.deleted_at is null").bind(target).bind(channel_id).fetch_optional(&self.pool).await?;
        let Some((target_name, target_owner, target_owner_name, runtime_id, policy, instruction)) =
            target_row
        else {
            return Ok(None);
        };
        let Some(runtime_id) = runtime_id else {
            return Ok(None);
        };
        let mut quote_messages = Vec::new();
        let (kind, rows) = if let Some(trigger) = trigger {
            let seq: Option<i64> = sqlx::query_scalar(
                "select seq from channel_messages where id=$1 and channel_id=$2",
            )
            .bind(trigger)
            .bind(channel_id)
            .fetch_optional(&self.pool)
            .await?;
            let Some(seq) = seq else { return Ok(None) };
            let mut rows=sqlx::query_as::<_,ChannelMessage>("select m.id,m.channel_id,m.seq,m.body,m.content,m.reply_to_message_id,m.sender_member_id,m.sender_blueprint_id,coalesce(u.display_name,u.email,ab.name) sender_name,coalesce(u.avatar_url,au.avatar_url) sender_avatar_url,case when m.sender_blueprint_id is null then 'member' else 'agent' end::text sender_kind,m.created_at::text created_at from channel_messages m left join organization_members om on om.id=m.sender_member_id left join users u on u.id=om.user_id left join agent_blueprints ab on ab.id=m.sender_blueprint_id left join organization_members aom on aom.id=ab.owner_member_id left join users au on au.id=aom.user_id where m.channel_id=$1 and m.seq<=$2 order by m.seq desc limit 11").bind(channel_id).bind(seq).fetch_all(&self.pool).await?;
            rows.reverse();
            quote_messages = self.reply_chain(channel_id, trigger).await?;
            ("mention", rows)
        } else {
            if (forwarded.is_empty() && explicit_query.is_none()) || forwarded.len() > 100 {
                return Ok(None);
            };
            let rows=sqlx::query_as::<_,ChannelMessage>("select m.id,m.channel_id,m.seq,m.body,m.content,m.reply_to_message_id,m.sender_member_id,m.sender_blueprint_id,coalesce(u.display_name,u.email,ab.name) sender_name,coalesce(u.avatar_url,au.avatar_url) sender_avatar_url,case when m.sender_blueprint_id is null then 'member' else 'agent' end::text sender_kind,m.created_at::text created_at from channel_messages m left join organization_members om on om.id=m.sender_member_id left join users u on u.id=om.user_id left join agent_blueprints ab on ab.id=m.sender_blueprint_id left join organization_members aom on aom.id=ab.owner_member_id left join users au on au.id=aom.user_id where m.channel_id=$1 and m.id=any($2) order by m.seq").bind(channel_id).bind(forwarded).fetch_all(&self.pool).await?;
            if rows.len() != forwarded.len() {
                return Ok(None);
            };
            (
                if forwarded.is_empty() {
                    "canvas_mention"
                } else {
                    "forward"
                },
                rows,
            )
        };
        let query = if kind == "mention" || kind == "canvas_mention" || explicit_query.is_some() {
            if let Some(query) = explicit_query
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                query.to_string()
            } else {
                rows.last().map(|row| row.body.clone()).unwrap_or_default()
            }
        } else {
            "Review the forwarded messages and complete the requested work.".into()
        };
        let before_seq = rows.first().map(|row| row.seq);
        let desired_state = invocation_state(requester == target_owner, &policy);
        let proposed_id = Uuid::new_v4();
        let mut tx = self.pool.begin().await?;
        let inserted:Option<Uuid>=sqlx::query_scalar("insert into agent_requests(id,channel_id,target_blueprint_id,runtime_id,requester_member_id,kind,query,trigger_seq,trigger_message_id,state,trace_context) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(trigger_message_id,target_blueprint_id) where trigger_message_id is not null do nothing returning id").bind(proposed_id).bind(channel_id).bind(target).bind(runtime_id).bind(requester).bind(kind).bind(&query).bind(rows.last().map(|row|row.seq)).bind(trigger).bind(desired_state).bind(trace_context).fetch_optional(&mut *tx).await?;
        let (id, state) = if let Some(id) = inserted {
            (id, desired_state.to_string())
        } else {
            let trigger =
                trigger.ok_or_else(|| anyhow::anyhow!("forward request nonce conflict"))?;
            sqlx::query_as::<_,(Uuid,String)>("select id,state from agent_requests where trigger_message_id=$1 and target_blueprint_id=$2").bind(trigger).bind(target).fetch_one(&mut *tx).await?
        };
        for (ordinal, row) in rows.iter().enumerate() {
            sqlx::query("insert into agent_request_messages(request_id,message_id,ordinal) values($1,$2,$3) on conflict do nothing").bind(id).bind(row.id).bind(ordinal as i32).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        let requester_name: String = sqlx::query_scalar("select coalesce(u.display_name,u.email) from organization_members om join users u on u.id=om.user_id where om.id=$1").bind(requester).fetch_one(&self.pool).await?;
        let trace_context: Option<serde_json::Value> = sqlx::query_scalar("select trace_context from agent_requests where id=$1").bind(id).fetch_one(&self.pool).await?;
        Ok(Some(AgentRequestBundle {
            request_owner_instruction: requester != target_owner && policy == "awaiting_owner",
            trace_context,
            id,
            channel_id,
            target_blueprint_id: target,
            target_name,
            target_owner_member_id: target_owner,
            target_owner_name,
            requester_name,
            instruction,
            runtime_id,
            kind: kind.into(),
            query,
            before_seq,
            state,
            messages: rows,
            quote_messages,
        }))
    }

    pub async fn agent_request_context(
        &self,
        user_id: Uuid,
        request_id: Uuid,
        before: i64,
        limit: i64,
    ) -> anyhow::Result<Option<Vec<ChannelMessage>>> {
        let channel:Option<Uuid>=sqlx::query_scalar("select ar.channel_id from agent_requests ar join agent_blueprints ab on ab.id=ar.target_blueprint_id join organization_members om on om.id=ab.owner_member_id where ar.id=$1 and om.user_id=$2").bind(request_id).bind(user_id).fetch_optional(&self.pool).await?;
        let Some(channel) = channel else {
            return Ok(None);
        };
        let mut rows=sqlx::query_as::<_,ChannelMessage>("select m.id,m.channel_id,m.seq,m.body,m.content,m.reply_to_message_id,m.sender_member_id,m.sender_blueprint_id,coalesce(u.display_name,u.email,ab.name) sender_name,coalesce(u.avatar_url,au.avatar_url) sender_avatar_url,case when m.sender_blueprint_id is null then 'member' else 'agent' end::text sender_kind,m.created_at::text created_at from channel_messages m left join organization_members om on om.id=m.sender_member_id left join users u on u.id=om.user_id left join agent_blueprints ab on ab.id=m.sender_blueprint_id left join organization_members aom on aom.id=ab.owner_member_id left join users au on au.id=aom.user_id where m.channel_id=$1 and m.seq<$2 order by m.seq desc limit $3").bind(channel).bind(before).bind(limit).fetch_all(&self.pool).await?;
        rows.reverse();
        Ok(Some(rows))
    }

    /// Request state is separate from the message cursor because running transitions do not append
    /// a message; consumers can therefore show honest progress before the final reply exists.
    pub async fn list_agent_requests(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<AgentRequestStatus>>> {
        if self.channel_actor(user_id, channel_id).await?.is_none() {
            return Ok(None);
        }
        let rows=sqlx::query_as::<_,AgentRequestStatus>(r#"select coalesce(ar.result_trace_context,ar.trace_context) trace_context,ar.id,case when ar.state='running' and ar.accepted_at is null then 'delivering' else ar.state end state,cm.id trigger_message_id,ar.target_blueprint_id,ab.name target_name,ar.source_canvas_id,
          to_char(ar.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') created_at,
          to_char(ar.accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') started_at,
          to_char(ar.finished_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') finished_at,
          case when ar.finished_at is not null and ar.accepted_at is not null then greatest(0,extract(epoch from ar.finished_at-ar.accepted_at)*1000)::bigint else null end duration_ms,
          left(ar.query,180) summary
          from agent_requests ar join agent_blueprints ab on ab.id=ar.target_blueprint_id left join channel_messages cm on cm.channel_id=ar.channel_id and cm.seq=ar.trigger_seq where ar.channel_id=$1 order by ar.created_at desc,ar.id desc"#)
            .bind(channel_id).fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }

    pub async fn save_agent_request_events(&self, user_id: Uuid, request_id: Uuid, events: &[serde_json::Value]) -> anyhow::Result<bool> {
        let allowed: bool = sqlx::query_scalar("select exists(select 1 from agent_requests ar join agent_blueprints ab on ab.id=ar.target_blueprint_id join organization_members om on om.id=ab.owner_member_id where ar.id=$1 and om.user_id=$2)").bind(request_id).bind(user_id).fetch_one(&self.pool).await?;
        if !allowed { return Ok(false); }
        sqlx::query("insert into agent_request_events(request_id,events) values($1,$2) on conflict(request_id) do update set events=excluded.events,updated_at=now()")
            .bind(request_id).bind(serde_json::Value::Array(events.to_vec())).execute(&self.pool).await?;
        Ok(true)
    }

    pub async fn agent_request_work_details(&self, user_id: Uuid, request_id: Uuid) -> anyhow::Result<Option<AgentRequestWorkDetails>> {
        let row:Option<(Uuid,String,String,Option<serde_json::Value>)>=sqlx::query_as("select ar.id,ar.state,ab.name,are.events from agent_requests ar join agent_blueprints ab on ab.id=ar.target_blueprint_id join channel_members cm on cm.channel_id=ar.channel_id join organization_members om on om.id=cm.organization_member_id left join agent_request_events are on are.request_id=ar.id where ar.id=$1 and om.user_id=$2")
            .bind(request_id).bind(user_id).fetch_optional(&self.pool).await?;
        Ok(row.map(|(request_id,state,target_name,events)|AgentRequestWorkDetails{request_id,state,target_name,events:events.and_then(|value|value.as_array().cloned()).unwrap_or_default()}))
    }

    pub async fn associate_agent_request_canvas(
        &self,
        request_id: Uuid,
        canvas_id: Uuid,
    ) -> anyhow::Result<()> {
        sqlx::query("update agent_requests set source_canvas_id=$2 where id=$1")
            .bind(request_id)
            .bind(canvas_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn claim_agent_request(
        &self,
        user_id: Uuid,
        runtime_id: Uuid,
    ) -> anyhow::Result<Option<AgentRequestBundle>> {
        let mut tx = self.pool.begin().await?;
        let owned=sqlx::query("update agent_runtimes r set last_seen_at=now() from organization_members om where r.id=$1 and om.id=r.owner_member_id and om.user_id=$2 and r.available").bind(runtime_id).bind(user_id).execute(&mut *tx).await?.rows_affected()==1;
        if !owned {
            tx.commit().await?;
            return Ok(None);
        }
        // Recover abandoned provider executions. The attempt cap makes repeated runtime crashes
        // converge to a visible terminal failure instead of an infinite Working/Queued loop.
        sqlx::query("update agent_requests set state=case when attempts>=3 then 'failed' else 'queued' end,claimed_at=null,accepted_at=null where runtime_id=$1 and state='running' and (claimed_at is null or claimed_at<now()-interval '30 minutes')")
            .bind(runtime_id).execute(&mut *tx).await?;
        let row:Option<(Uuid,Uuid,Uuid,String,Uuid,String,String,String,String,String,Option<i64>)>=sqlx::query_as(
            "select req.id,req.channel_id,req.target_blueprint_id,b.name,b.owner_member_id,coalesce(owner.display_name,owner.email),coalesce(requester.display_name,requester.email),b.loading_instruction,req.kind,req.query,req.trigger_seq from agent_requests req join agent_blueprints b on b.id=req.target_blueprint_id join agent_runtimes r on r.id=req.runtime_id join organization_members om on om.id=r.owner_member_id join organization_members boom on boom.id=b.owner_member_id join users owner on owner.id=boom.user_id join organization_members rom on rom.id=req.requester_member_id join users requester on requester.id=rom.user_id where req.runtime_id=$1 and om.user_id=$2 and r.available and b.deleted_at is null and req.state='queued' order by req.created_at for update of req skip locked limit 1"
        ).bind(runtime_id).bind(user_id).fetch_optional(&mut *tx).await?;
        let Some((
            id,
            channel_id,
            target_blueprint_id,
            target_name,
            target_owner_member_id,
            target_owner_name,
            requester_name,
            instruction,
            kind,
            query,
            trigger_seq,
        )) = row
        else {
            tx.commit().await?;
            return Ok(None);
        };
        sqlx::query("update agent_requests set state='running',claimed_at=now(),accepted_at=null,attempts=attempts+1 where id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        let messages=sqlx::query_as::<_,ChannelMessage>("select m.id,m.channel_id,m.seq,m.body,m.content,m.reply_to_message_id,m.sender_member_id,m.sender_blueprint_id,coalesce(u.display_name,u.email,b.name) sender_name,coalesce(u.avatar_url,au.avatar_url) sender_avatar_url,case when m.sender_blueprint_id is null then 'member' else 'agent' end::text sender_kind,m.created_at::text created_at from agent_request_messages arm join channel_messages m on m.id=arm.message_id left join organization_members om on om.id=m.sender_member_id left join users u on u.id=om.user_id left join agent_blueprints b on b.id=m.sender_blueprint_id left join organization_members aom on aom.id=b.owner_member_id left join users au on au.id=aom.user_id where arm.request_id=$1 order by arm.ordinal").bind(id).fetch_all(&mut *tx).await?;
        tx.commit().await?;
        let quote_messages = match messages.last() {
            Some(message) => self.reply_chain(channel_id, message.id).await?,
            None => Vec::new(),
        };
        let trace_context: Option<serde_json::Value> = sqlx::query_scalar("select trace_context from agent_requests where id=$1").bind(id).fetch_one(&self.pool).await?;
        Ok(Some(AgentRequestBundle {
            request_owner_instruction: false,
            trace_context,
            id,
            channel_id,
            target_blueprint_id,
            target_name,
            target_owner_member_id,
            target_owner_name,
            requester_name,
            instruction,
            runtime_id,
            kind,
            query,
            before_seq: messages.first().map(|row| row.seq).or(trigger_seq),
            state: "running".into(),
            messages,
            quote_messages,
        }))
    }

    pub async fn runtime_owned(&self, user_id: Uuid, runtime_id: Uuid) -> anyhow::Result<bool> {
        Ok(sqlx::query("update agent_runtimes r set last_seen_at=now() from organization_members om where r.id=$1 and om.id=r.owner_member_id and om.user_id=$2 and r.available")
            .bind(runtime_id).bind(user_id).execute(&self.pool).await?.rows_affected()==1)
    }

    pub async fn release_agent_request(
        &self,
        user_id: Uuid,
        request_id: Uuid,
    ) -> anyhow::Result<()> {
        sqlx::query("update agent_requests ar set state='queued',claimed_at=null,accepted_at=null from agent_runtimes r join organization_members om on om.id=r.owner_member_id where ar.id=$1 and ar.runtime_id=r.id and om.user_id=$2 and ar.state='running'")
            .bind(request_id).bind(user_id).execute(&self.pool).await?;
        Ok(())
    }

    /// Separates server-side claiming from actual client delivery. Only this transition is exposed
    /// as Agent activity, so an unreachable Local Core never appears to the user as "working".
    pub async fn accept_agent_request(
        &self,
        user_id: Uuid,
        request_id: Uuid,
    ) -> anyhow::Result<Option<Uuid>> {
        sqlx::query_scalar("update agent_requests ar set accepted_at=coalesce(accepted_at,now()) from agent_runtimes r join organization_members om on om.id=r.owner_member_id where ar.id=$1 and ar.runtime_id=r.id and om.user_id=$2 and ar.state='running' returning ar.channel_id")
            .bind(request_id).bind(user_id).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    pub async fn complete_agent_request(
        &self,
        user_id: Uuid,
        request_id: Uuid,
        trace_context: Option<&serde_json::Value>,
    ) -> anyhow::Result<Option<Uuid>> {
        sqlx::query_scalar("update agent_requests ar set state='succeeded',result_trace_context=coalesce($3,result_trace_context) from agent_runtimes r join organization_members om on om.id=r.owner_member_id where ar.id=$1 and ar.runtime_id=r.id and om.user_id=$2 and ar.state in ('queued','running','failed','succeeded') returning ar.channel_id")
            .bind(request_id).bind(user_id).bind(trace_context).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    pub async fn report_agent_request(
        &self,
        user_id: Uuid,
        request_id: Uuid,
        body: &str,
        nonce: Uuid,
    ) -> anyhow::Result<Option<ChannelMessage>> {
        let mut tx = self.pool.begin().await?;
        let row:Option<(Uuid,Uuid,String,Uuid,String,Option<Uuid>)>=sqlx::query_as("select ar.channel_id,ar.target_blueprint_id,ar.state,ar.requester_member_id,coalesce(requester.display_name,requester.email),ar.trigger_message_id from agent_requests ar join agent_blueprints ab on ab.id=ar.target_blueprint_id join organization_members om on om.id=ab.owner_member_id join organization_members requester_member on requester_member.id=ar.requester_member_id join users requester on requester.id=requester_member.user_id where ar.id=$1 and om.user_id=$2 for update of ar").bind(request_id).bind(user_id).fetch_optional(&mut *tx).await?;
        let Some((
            channel,
            blueprint,
            state,
            requester_member_id,
            requester_name,
            trigger_message_id,
        )) = row
        else {
            return Ok(None);
        };
        if state == "succeeded" {
            let seq:Option<i64>=sqlx::query_scalar("select m.seq from agent_request_outputs o join channel_messages m on m.id=o.message_id where o.request_id=$1").bind(request_id).fetch_optional(&mut *tx).await?;
            if let Some(seq) = seq {
                tx.commit().await?;
                return Ok(self
                    .list_messages(user_id, channel, seq - 1, 1)
                    .await?
                    .and_then(|mut rows| rows.pop()));
            }
        }
        let id = Uuid::new_v4();
        let (rendered_body, content) =
            request_reply_content(requester_member_id, &requester_name, body);
        // Agent tools submit only their own text. Server fixes the addressee and reply target from
        // the authorized request so a provider cannot impersonate or freely mention members.
        sqlx::query("insert into channel_messages(id,channel_id,sender_blueprint_id,body,content,reply_to_message_id,client_nonce) values($1,$2,$3,$4,$5,$6,$7) on conflict(channel_id,client_nonce) do nothing").bind(id).bind(channel).bind(blueprint).bind(rendered_body).bind(content).bind(trigger_message_id).bind(nonce).execute(&mut *tx).await?;
        let message_id: Option<Uuid> = sqlx::query_scalar(
            "select id from channel_messages where channel_id=$1 and client_nonce=$2",
        )
        .bind(channel)
        .bind(nonce)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(message_id) = message_id else {
            return Ok(None);
        };
        sqlx::query("insert into agent_request_outputs(request_id,message_id) values($1,$2) on conflict(request_id) do nothing").bind(request_id).bind(message_id).execute(&mut *tx).await?;
        sqlx::query("update agent_requests set state='succeeded' where id=$1")
            .bind(request_id)
            .execute(&mut *tx)
            .await?;
        let seq: i64 = sqlx::query_scalar("select seq from channel_messages where id=$1")
            .bind(message_id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(self
            .list_messages(user_id, channel, seq - 1, 1)
            .await?
            .and_then(|mut rows| rows.pop()))
    }

    pub async fn create_agent_message(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        blueprint_id: Uuid,
        body: &str,
        content: &serde_json::Value,
        reply: Option<Uuid>,
        nonce: Uuid,
    ) -> anyhow::Result<Option<ChannelMessage>> {
        if self.channel_actor(user_id, channel_id).await?.is_none() {
            return Ok(None);
        }
        sqlx::query("insert into channel_messages(id,channel_id,sender_blueprint_id,body,content,reply_to_message_id,client_nonce) values($1,$2,$3,$4,$5,$6,$7) on conflict(channel_id,client_nonce) do nothing")
            .bind(Uuid::new_v4()).bind(channel_id).bind(blueprint_id).bind(body).bind(content).bind(reply).bind(nonce).execute(&self.pool).await?;
        let seq: Option<i64> = sqlx::query_scalar(
            "select seq from channel_messages where channel_id=$1 and client_nonce=$2",
        )
        .bind(channel_id)
        .bind(nonce)
        .fetch_optional(&self.pool)
        .await?;
        let Some(seq) = seq else { return Ok(None) };
        Ok(self
            .list_messages(user_id, channel_id, seq - 1, 1)
            .await?
            .and_then(|mut rows| rows.pop()))
    }

    pub async fn fail_agent_request(
        &self,
        user_id: Uuid,
        request_id: Uuid,
        error: &str,
        trace_context: Option<&serde_json::Value>,
    ) -> anyhow::Result<Option<Uuid>> {
        let channel: Option<Uuid> = sqlx::query_scalar("update agent_requests ar set state='failed',result_trace_context=coalesce($3,result_trace_context) from agent_blueprints ab join organization_members om on om.id=ab.owner_member_id where ar.id=$1 and ar.target_blueprint_id=ab.id and om.user_id=$2 and ar.state in ('running','failed') returning ar.channel_id")
            .bind(request_id).bind(user_id).bind(trace_context).fetch_optional(&self.pool).await?;
        if channel.is_some() {
            // Provider diagnostics can contain local paths; keep them out of Channel messages.
            eprintln!("Agent request {request_id} failed: {error}");
        }
        Ok(channel)
    }
}
