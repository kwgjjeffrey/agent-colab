//! Channel message and Agent-blueprint HTTP/WebSocket boundary.
//!
//! Durable mutations stay on HTTP.  WebSocket only announces the newest committed sequence, so a
//! reconnect or dropped frame is repaired by the same `after` query instead of a second queue.

use super::*;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MessageInvalidation {
    pub channel_id: uuid::Uuid,
    pub latest_seq: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AgentRequestInvalidation {
    pub channel_id: uuid::Uuid,
    /// Present only when a durable request was queued for a concrete runtime.  The same
    /// authenticated WebSocket used by Messages is the wake-up transport; the database claim
    /// remains authoritative, so this hint can be dropped or duplicated safely.
    pub runtime_id: Option<uuid::Uuid>,
}

#[derive(Deserialize)]
pub(super) struct MessagePage {
    #[serde(default)]
    after: i64,
    limit: Option<i64>,
    before: Option<i64>,
    latest: Option<bool>,
}

#[derive(Deserialize)]
struct AgentRequestEventsBody { events: Vec<serde_json::Value> }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateMessage {
    plain_text: String,
    content: serde_json::Value,
    reply_to_message_id: Option<uuid::Uuid>,
    client_nonce: uuid::Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BlueprintBody {
    name: String,
    #[serde(default)]
    loading_instruction: String,
    #[serde(default)]
    loading_command: String,
    runtime_device: Option<String>,
    runtime_agent: Option<String>,
    runtime_id: Option<uuid::Uuid>,
    invocation_policy: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct BlueprintQuery {
    owner_member_id: Option<uuid::Uuid>,
}

#[derive(Deserialize)]
pub(super) struct ChannelSelection {
    enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeRegistration {
    device_id: uuid::Uuid,
    device_name: String,
    provider: String,
    skill_version: String,
    available: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAgentRequest {
    target_blueprint_id: uuid::Uuid,
    #[serde(default)]
    forwarded_message_ids: Vec<uuid::Uuid>,
    #[serde(default)]
    instruction: String,
    #[serde(default)]
    context_refs: Vec<super::context_prompt::ContextRef>,
}
#[derive(Deserialize)]
struct ContextPage {
    before: i64,
    limit: Option<i64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentReport {
    message: String,
    client_nonce: uuid::Uuid,
}
#[derive(Deserialize)]
struct AgentFailure {
    error: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AgentRequestResponse {
    pub(super) id: uuid::Uuid,
    pub(super) channel_id: uuid::Uuid,
    pub(super) state: String,
    pub(super) prompt: String,
    pub(super) trace_context: Option<serde_json::Value>,
    pub(super) runtime_id: uuid::Uuid,
    pub(super) target_blueprint_id: uuid::Uuid,
    pub(super) thread_title: String,
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route("/v1/channels/{channel_id}/participants", get(participants))
        .route("/v1/channels/{channel_id}/agent-runtimes", get(runtimes))
        .route(
            "/v1/organizations/{organization_id}/agent-runtimes/register",
            post(register_runtime),
        )
        .route(
            "/v1/channels/{channel_id}/blueprints",
            get(blueprints).post(create_blueprint),
        )
        .route(
            "/v1/channels/{channel_id}/blueprints/{blueprint_id}",
            patch(update_blueprint).delete(delete_blueprint),
        )
        .route(
            "/v1/channels/{channel_id}/blueprints/{blueprint_id}/selection",
            patch(select_blueprint),
        )
        .route(
            "/v1/channels/{channel_id}/messages",
            get(messages).post(send_message),
        )
        .route("/v1/channels/{channel_id}/messages/{message_id}", get(message_by_id))
        .route(
            "/v1/channels/{channel_id}/agent-requests",
            get(agent_requests).post(create_agent_request),
        )
        .route(
            "/v1/agent-requests/{request_id}/context",
            get(agent_request_context),
        )
        .route(
            "/v1/agent-requests/{request_id}/reply",
            post(agent_request_reply),
        )
        .route(
            "/v1/agent-requests/{request_id}/fail",
            post(agent_request_fail),
        )
        .route(
            "/v1/agent-requests/{request_id}/complete",
            post(agent_request_complete),
        )
        .route(
            "/v1/agent-requests/{request_id}/events",
            get(agent_request_events).post(save_agent_request_events),
        )
        .route("/v1/messages/stream", get(stream))
        .route(
            "/v1/agent-runtimes/{runtime_id}/stream",
            get(runtime_stream),
        )
}

async fn participants(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::ChannelParticipant>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.participants", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_channel_participants(user, channel)
        .await
        .map_err(|_| ApiError::internal("participant_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}

async fn blueprints(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Query(query): Query<BlueprintQuery>,
) -> Result<Json<Vec<colab_server_persistence::AgentBlueprint>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.blueprints", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_blueprints(user, channel, query.owner_member_id)
        .await
        .map_err(|_| ApiError::internal("blueprint_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}

async fn create_blueprint(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Json(body): Json<BlueprintBody>,
) -> Result<(StatusCode, Json<colab_server_persistence::AgentBlueprint>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.create-blueprint", async {

    let user = authenticated_user(&state, &headers).await?;
    let name = valid_name(&body.name)?;
    let policy = body
        .invocation_policy
        .as_deref()
        .unwrap_or("awaiting_owner");
    if !matches!(policy, "refuse" | "awaiting_owner" | "process") {
        return Err(ApiError::bad_request("invalid_invocation_policy"));
    }
    let runtime_id = body
        .runtime_id
        .ok_or_else(|| ApiError::bad_request("runtime_required"))?;
    let created = state
        .database
        .create_blueprint(
            user,
            channel,
            name,
            &body.loading_instruction,
            &body.loading_command,
            runtime_id,
            policy,
        )
        .await
        .map_err(|error| {
            if colab_server_persistence::is_unique_violation(&error) {
                ApiError::name_conflict("blueprint_name_conflict")
            } else {
                ApiError::internal("blueprint_create_failed")
            }
        })?
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))?;
    Ok((StatusCode::CREATED, Json(created)))

}).await
}

async fn update_blueprint(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((channel, id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<BlueprintBody>,
) -> Result<Json<colab_server_persistence::AgentBlueprint>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.update-blueprint", async {

    let user = authenticated_user(&state, &headers).await?;
    let name = valid_name(&body.name)?;
    if body.loading_instruction.chars().count() > 20000
        || body.loading_command.chars().count() > 4000
    {
        return Err(ApiError::bad_request("invalid_blueprint_content"));
    }
    let policy = body
        .invocation_policy
        .as_deref()
        .unwrap_or("awaiting_owner");
    if !matches!(policy, "refuse" | "awaiting_owner" | "process") {
        return Err(ApiError::bad_request("invalid_invocation_policy"));
    }
    let runtime_id = body
        .runtime_id
        .ok_or_else(|| ApiError::bad_request("runtime_required"))?;
    state
        .database
        .update_blueprint(
            user,
            channel,
            id,
            name,
            &body.loading_instruction,
            &body.loading_command,
            body.runtime_device.as_deref(),
            body.runtime_agent.as_deref(),
            runtime_id,
            policy,
        )
        .await
        .map_err(|_| ApiError::internal("blueprint_update_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("blueprint_update_forbidden"))

}).await
}

async fn runtimes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::AgentRuntime>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.runtimes", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_runtimes(user, channel)
        .await
        .map_err(|_| ApiError::internal("runtime_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}

async fn register_runtime(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<uuid::Uuid>,
    Json(body): Json<RuntimeRegistration>,
) -> Result<Json<colab_server_persistence::AgentRuntime>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.register-runtime", async {

    let user = authenticated_user(&state, &headers).await?;
    if body.device_name.trim().is_empty()
        || body.device_name.chars().count() > 120
        || !matches!(body.provider.as_str(), "codex" | "claude" | "myflicker")
    {
        return Err(ApiError::bad_request("invalid_runtime"));
    }
    state
        .database
        .register_runtime(
            user,
            organization,
            body.device_id,
            body.device_name.trim(),
            &body.provider,
            &body.skill_version,
            body.available,
        )
        .await
        .map_err(|_| ApiError::internal("runtime_register_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("organization_access_forbidden"))

}).await
}

async fn delete_blueprint(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((channel, id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.delete-blueprint", async {

    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .delete_blueprint(user, channel, id)
        .await
        .map_err(|_| ApiError::internal("blueprint_delete_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("blueprint_delete_forbidden"))
    }

}).await
}

async fn select_blueprint(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((channel, id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<ChannelSelection>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.select-blueprint", async {

    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .set_blueprint_channel(user, channel, id, body.enabled)
        .await
        .map_err(|_| ApiError::internal("blueprint_selection_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("blueprint_selection_forbidden"))
    }

}).await
}

async fn messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Query(page): Query<MessagePage>,
) -> Result<Json<Vec<colab_server_persistence::ChannelMessage>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.messages", async {

    let user = authenticated_user(&state, &headers).await?;
    let limit = page.limit.unwrap_or(100).clamp(1, 200);
    let result = if page.latest == Some(true) || page.before.is_some() {
        state.database.list_messages_before(user, channel, page.before.unwrap_or(i64::MAX), limit).await
    } else {
        state.database.list_messages(user, channel, page.after, limit).await
    };
    result
        .map_err(|_| ApiError::internal("message_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}

async fn message_by_id(State(state): State<AppState>, headers: HeaderMap, Path((channel, id)): Path<(uuid::Uuid, uuid::Uuid)>) -> Result<Json<colab_server_persistence::ChannelMessage>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.message-by-id", async {

    let user = authenticated_user(&state, &headers).await?;
    state.database.message_by_id(user, channel, id).await.map_err(|_| ApiError::internal("message_read_failed"))?.map(Json).ok_or_else(|| ApiError::forbidden("message_unavailable"))

}).await
}
async fn send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Json(body): Json<CreateMessage>,
) -> Result<(StatusCode, Json<colab_server_persistence::ChannelMessage>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.send-message", async {

    let user = authenticated_user(&state, &headers).await?;
    let text = body.plain_text.trim();
    if text.is_empty() || text.chars().count() > 20000 || content_plain_text(&body.content) != text
    {
        return Err(ApiError::bad_request("invalid_message"));
    }
    for reference in super::context_prompt::references(&body.content) {
        if !state.database.context_reference_visible(user, channel, &reference.kind, reference.id).await.map_err(|_| ApiError::internal("context_reference_check_failed"))? { return Err(ApiError::forbidden("context_reference_unavailable")); }
    }
    let message = state
        .database
        .create_message(
            user,
            channel,
            text,
            &body.content,
            body.reply_to_message_id,
            body.client_nonce,
        )
        .await
        .map_err(|_| ApiError::internal("message_send_failed"))?
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))?;
    let _ = state.message_events.send(MessageInvalidation {
        channel_id: channel,
        latest_seq: message.seq,
    });
    // A message is the only user-facing mutation. Agent commands are derived server-side from
    // immutable mention node identities so clients cannot create a message and command that drift.
    for target in agent_mentions(&body.content) {
        let Some(bundle) = state
            .database
            .create_agent_request(user, channel, target, Some(message.id), &[], Some(text), Some(&colab_observability::context_json()))
            .await
            .map_err(|_| ApiError::internal("agent_request_route_failed"))?
        else {
            return Err(ApiError::bad_request("invalid_agent_mention"));
        };
        let generated = match bundle.state.as_str() {
            "rejected" if bundle.request_owner_instruction => {
                let response = format!(
                    "@{}, please reply and @mention me with your instructions if you'd like me to work on this.",
                    bundle.target_owner_name
                );
                Some((
                    response.clone(),
                    mention_content(
                        &response,
                        bundle.target_owner_member_id,
                        &bundle.target_owner_name,
                        "member",
                    ),
                ))
            }
            "rejected" => Some((
                "I can't accept requests from other people.".to_string(),
                text_content("I can't accept requests from other people."),
            )),
            "queued"
                if !state
                    .runtime_presence
                    .read()
                    .await
                    .contains_key(&bundle.runtime_id) =>
            {
                let response =
                    "I'm offline at the moment. Will be on it when back online".to_string();
                Some((response.clone(), text_content(&response)))
            }
            _ => None,
        };
        if let Some((response, content)) = generated {
            if let Some(row) = state
                .database
                .create_agent_message(
                    user,
                    channel,
                    bundle.target_blueprint_id,
                    &response,
                    &content,
                    Some(message.id),
                    bundle.id,
                )
                .await
                .map_err(|_| ApiError::internal("agent_route_message_failed"))?
            {
                let _ = state.message_events.send(MessageInvalidation {
                    channel_id: channel,
                    latest_seq: row.seq,
                });
            }
        }
        if bundle.state == "queued" {
            let _ = state.agent_request_events.send(bundle.runtime_id);
        }
    }
    Ok((StatusCode::CREATED, Json(message)))

}).await
}

async fn create_agent_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Json(body): Json<CreateAgentRequest>,
) -> Result<(StatusCode, Json<AgentRequestResponse>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.create-agent-request", async {

    let user = authenticated_user(&state, &headers).await?;
    if body.forwarded_message_ids.is_empty() && body.context_refs.is_empty() {
        return Err(ApiError::bad_request("invalid_agent_request_source"));
    }
    if body.instruction.chars().count() > 20000 || body.context_refs.len() > 100 { return Err(ApiError::bad_request("invalid_agent_request_source")); }
    if !state.database.forward_source_valid(user, channel, body.target_blueprint_id, &body.forwarded_message_ids).await.map_err(|_| ApiError::internal("agent_request_source_check_failed"))? { return Err(ApiError::forbidden("agent_request_forbidden")); }
    for reference in &body.context_refs {
        if !state.database.context_reference_visible(user, channel, &reference.kind, reference.id).await.map_err(|_| ApiError::internal("context_reference_check_failed"))? { return Err(ApiError::forbidden("context_reference_unavailable")); }
    }
    let mut forwarded = body.forwarded_message_ids.clone();
    // A resource handoff is a visible Channel action, not a private DM to a collaborator's device.
    if !body.context_refs.is_empty() {
        let mut children = vec![serde_json::json!({"type":"text","text":format!("Forwarded context to Agent {}. {} ",body.target_blueprint_id,body.instruction)})];
        for row in &body.context_refs {
            let name = state.database.context_reference_label(channel, &row.kind, row.id).await.map_err(|_| ApiError::internal("context_reference_read_failed"))?.ok_or_else(|| ApiError::forbidden("context_reference_unavailable"))?;
            children.push(serde_json::json!({"type":"mention","attrs":{"kind":row.kind,"id":row.id,"label":name}}));
            children.push(serde_json::json!({"type":"text","text":" "}));
        }
        let content = serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":children}]});
        let text = content_plain_text(&content);
        let message = state.database.create_message(user, channel, &text, &content, None, uuid::Uuid::new_v4()).await.map_err(|_| ApiError::internal("context_handoff_record_failed"))?.ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))?;
        let _ = state.message_events.send(MessageInvalidation { channel_id: channel, latest_seq: message.seq });
        forwarded.push(message.id);
    }
    let query = if body.instruction.trim().is_empty() { "Review the forwarded context and complete the requested work." } else { body.instruction.trim() };
    let bundle = state
        .database
        .create_agent_request(
            user,
            channel,
            body.target_blueprint_id,
            None,
            &forwarded,
            Some(query),
            Some(&colab_observability::context_json()),
        )
        .await
        .map_err(|_| ApiError::internal("agent_request_create_failed"))?
        .ok_or_else(|| ApiError::forbidden("agent_request_forbidden"))?;
    let response = agent_request_response(bundle);
    if response.state == "queued" {
        let _ = state.agent_request_events.send(response.runtime_id);
    }
    let _ = state.agent_status_events.send(AgentRequestInvalidation {
        channel_id: channel,
        runtime_id: (response.state == "queued").then_some(response.runtime_id),
    });
    Ok((StatusCode::CREATED, Json(response)))

}).await
}

async fn agent_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::AgentRequestStatus>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.agent-requests", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_agent_requests(user, channel)
        .await
        .map_err(|error| { eprintln!("agent request list failed for {channel}: {error:#}"); ApiError::internal("agent_request_list_failed") })?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}

async fn save_agent_request_events(State(state):State<AppState>,headers:HeaderMap,Path(request):Path<uuid::Uuid>,Json(body):Json<AgentRequestEventsBody>)->Result<StatusCode,ApiError>{
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.save-agent-request-events", async {

    let user=authenticated_user(&state,&headers).await?;
    state.database.save_agent_request_events(user,request,&body.events).await.map_err(|error|{eprintln!("save Agent work details failed for {request}: {error:#}");ApiError::internal("agent_request_events_save_failed")})?.then_some(StatusCode::NO_CONTENT).ok_or_else(||ApiError::forbidden("agent_request_forbidden"))

}).await
}

async fn agent_request_events(State(state):State<AppState>,headers:HeaderMap,Path(request):Path<uuid::Uuid>)->Result<Json<colab_server_persistence::AgentRequestWorkDetails>,ApiError>{
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.agent-request-events", async {

    let user=authenticated_user(&state,&headers).await?;
    state.database.agent_request_work_details(user,request).await.map_err(|error|{eprintln!("read Agent work details failed for {request}: {error:#}");ApiError::internal("agent_request_events_read_failed")})?.map(Json).ok_or_else(||ApiError::forbidden("agent_request_forbidden"))

}).await
}

pub(super) fn agent_request_response(bundle: colab_server_persistence::AgentRequestBundle) -> AgentRequestResponse { assemble_agent_request(bundle, "preview") }
fn assemble_agent_request(bundle: colab_server_persistence::AgentRequestBundle, stage: &str) -> AgentRequestResponse {
    let current = bundle.messages.last();
    let quoted_ids = bundle
        .quote_messages
        .iter()
        .map(|row| row.id)
        .collect::<std::collections::HashSet<_>>();
    let context = bundle
        .messages
        .iter()
        .filter(|row| Some(row.id) != current.map(|item| item.id) && !quoted_ids.contains(&row.id))
.map(|row| format!("[Message {} · {}]\n{}", row.seq, row.sender_name, super::context_prompt::message_text(row)))
        .collect::<Vec<_>>()
        .join("\n\n");
    let quotes = bundle
        .quote_messages
        .iter()
        .map(|row| format!("[Message {} · {}]\n{}", row.seq, row.sender_name, super::context_prompt::message_text(row)))
        .collect::<Vec<_>>()
        .join("\n\n");
    let root = "~/.agents/skills/agent-colab/bin/colab-messages";
    let history = if bundle.kind == "mention" && bundle.before_seq.is_some() {
        format!(
            "\n\nTo load earlier messages for this task, run:\n{root} request context --request '{}' --before '{}' --limit 20",
            bundle.id,
            bundle.before_seq.unwrap_or(0)
        )
    } else {
        String::new()
    };
    let history =
        format!("\n\nTools below are at your disposal if the user's task requires them:{history}");
    let quoted = if quotes.is_empty() {
        String::new()
    } else {
        format!("\n\nQuoted messages:\n{quotes}")
    };
    let context = if bundle.kind == "forward" { bundle.messages.iter().map(|row| format!("[Message {} · {}]\n{}", row.seq, row.sender_name, super::context_prompt::message_text(row))).collect::<Vec<_>>().join("\n\n") } else { context };
    let resource_tools = super::context_prompt::instructions(bundle.channel_id, &bundle.messages.iter().chain(bundle.quote_messages.iter()).flat_map(|row| super::context_prompt::references(&row.content)).collect::<Vec<_>>());
    let recent = if context.is_empty() {
        quoted
    } else {
        format!("{quoted}\n\nRecent conversation:\n{context}")
    };
    let instruction = if bundle.instruction.trim().is_empty() {
        String::new()
    } else {
        format!("\n\nInstruction: {}", bundle.instruction.trim())
    };
    let query = if bundle.kind == "mention" { current.map(|row| super::context_prompt::message_text(row)).unwrap_or_else(|| bundle.query.clone()) } else { bundle.query.clone() };
    let prompt = if bundle.kind == "canvas_mention" {
        format!("{}: {}", bundle.requester_name, bundle.query)
    } else {
        format!(
            "{}: {}{}{}{}\n\nWhen you complete the task, send a summary back to the Channel by running the command below. You can also use the same command to share progress updates when necessary.\n\n{root} request reply \\\n  --request '{}' \\\n  --message '<message>'",
            bundle.requester_name, query, recent, instruction, format!("{history}\n\n{resource_tools}"), bundle.id
        )
    };
    // W3C correlation is non-secret. Prefix the concrete tools so Agent-invoked CLI requests
    // continue this workflow rather than creating unrelated traces after the process boundary.
    let envelope=colab_observability::context_json();
    let prompt=if let (Some(parent),Some(entry))=(envelope["traceparent"].as_str(),envelope["entryId"].as_str()) {
        let prefix=format!("COLAB_TRACEPARENT='{parent}' COLAB_TRACE_ENTRY_ID='{entry}' ");
        prompt.lines().map(|line|if line.trim_start().starts_with("~/.agents/skills/agent-colab/bin/") {format!("{prefix}{line}")} else {line.to_owned()}).collect::<Vec<_>>().join("\n")
    }else{prompt};
    colab_observability::prompt_at(&bundle.kind, stage, Some(bundle.id.to_string()), &prompt, "server/standalone/crates/api/src/messaging.rs", "assemble_agent_request");
    AgentRequestResponse {
        id: bundle.id,
        channel_id: bundle.channel_id,
        state: bundle.state,
        prompt,
        trace_context: Some(colab_observability::context_json()),
        runtime_id: bundle.runtime_id,
        target_blueprint_id: bundle.target_blueprint_id,
        thread_title: format!("{} · Agent Colab", bundle.target_name),
    }
}

fn agent_mentions(content: &serde_json::Value) -> Vec<uuid::Uuid> {
    fn visit(value: &serde_json::Value, output: &mut Vec<uuid::Uuid>) {
        if value.get("type").and_then(serde_json::Value::as_str) == Some("mention") && matches!(value["attrs"]["kind"].as_str(), None | Some("agent")) {
            if let Some(id) = value
                .get("attrs")
                .and_then(|attrs| attrs.get("id"))
                .and_then(serde_json::Value::as_str)
                .and_then(|raw| uuid::Uuid::parse_str(raw).ok())
            {
                if !output.contains(&id) {
                    output.push(id);
                }
            }
        }
        if let Some(children) = value.get("content").and_then(serde_json::Value::as_array) {
            for child in children {
                visit(child, output);
            }
        }
    }
    let mut output = Vec::new();
    visit(content, &mut output);
    output
}

fn content_plain_text(content: &serde_json::Value) -> String {
    fn render(value: &serde_json::Value) -> String {
        match value.get("type").and_then(serde_json::Value::as_str) {
            Some("text") => value
                .get("text")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("")
                .to_string(),
            Some("mention") => format!(
                "@{}",
                value
                    .get("attrs")
                    .and_then(|v| v.get("label"))
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("")
            ),
            Some("hardBreak") => "\n".into(),
            kind => {
                let joined = value
                    .get("content")
                    .and_then(serde_json::Value::as_array)
                    .map(|items| items.iter().map(render).collect::<String>())
                    .unwrap_or_default();
                if kind == Some("paragraph") {
                    format!("{joined}\n")
                } else {
                    joined
                }
            }
        }
    }
    render(content)
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn text_content(text: &str) -> serde_json::Value {
    serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]})
}
fn mention_content(text: &str, id: uuid::Uuid, label: &str, kind: &str) -> serde_json::Value {
    let token = format!("@{label}");
    let Some(at) = text.find(&token) else {
        return text_content(text);
    };
    serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[
        {"type":"mention","attrs":{"id":id,"label":label,"kind":kind}},
        {"type":"text","text":&text[at+token.len()..]}
    ]}]})
}

async fn agent_request_context(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request): Path<uuid::Uuid>,
    Query(page): Query<ContextPage>,
) -> Result<Json<Vec<colab_server_persistence::ChannelMessage>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.agent-request-context", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .agent_request_context(
            user,
            request,
            page.before,
            page.limit.unwrap_or(20).clamp(1, 100),
        )
        .await
        .map_err(|_| ApiError::internal("agent_request_context_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("agent_request_forbidden"))

}).await
}

async fn agent_request_reply(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request): Path<uuid::Uuid>,
    Json(body): Json<AgentReport>,
) -> Result<(StatusCode, Json<colab_server_persistence::ChannelMessage>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.agent-request-reply", async {

    let user = authenticated_user(&state, &headers).await?;
    let message = body.message.trim();
    if message.is_empty() || message.chars().count() > 20000 {
        return Err(ApiError::bad_request("invalid_message"));
    }
    let row = state
        .database
        .report_agent_request(user, request, message, body.client_nonce)
        .await
        .map_err(|_| ApiError::internal("agent_request_reply_failed"))?
        .ok_or_else(|| ApiError::forbidden("agent_request_forbidden"))?;
    let _ = state.message_events.send(MessageInvalidation {
        channel_id: row.channel_id,
        latest_seq: row.seq,
    });
    let _ = state.agent_status_events.send(AgentRequestInvalidation {
        channel_id: row.channel_id,
        runtime_id: None,
    });
    Ok((StatusCode::CREATED, Json(row)))

}).await
}

async fn agent_request_fail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request): Path<uuid::Uuid>,
    Json(body): Json<AgentFailure>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.agent-request-fail", async {

    let user = authenticated_user(&state, &headers).await?;
    // A claimed request must never remain invisibly `running` after provider launch/resume fails.
    let error = body.error.trim();
    if error.is_empty() || error.chars().count() > 2000 {
        return Err(ApiError::bad_request("invalid_agent_failure"));
    }
    let channel = state
        .database
        .fail_agent_request(user, request, error, Some(&colab_observability::context_json()))
        .await
        .map_err(|_| ApiError::internal("agent_request_fail_failed"))?
        .ok_or_else(|| ApiError::forbidden("agent_request_forbidden"))?;
    let _ = state.agent_status_events.send(AgentRequestInvalidation {
        channel_id: channel,
        runtime_id: None,
    });
    Ok(StatusCode::NO_CONTENT)

}).await
}

async fn agent_request_complete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.agent-request-complete", async {

    let user = authenticated_user(&state, &headers).await?;
    if let Some(channel) = state
        .database
        .complete_agent_request(user, request, Some(&colab_observability::context_json()))
        .await
        .map_err(|_| ApiError::internal("agent_request_complete_failed"))?
    {
        let _ = state.agent_status_events.send(AgentRequestInvalidation {
            channel_id: channel,
            runtime_id: None,
        });
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("agent_request_forbidden"))
    }

}).await
}

async fn runtime_stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(runtime): Path<uuid::Uuid>,
    upgrade: WebSocketUpgrade,
) -> Result<impl IntoResponse, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.runtime-stream", async {

    let user = authenticated_user(&state, &headers).await?;
    if !state
        .database
        .runtime_owned(user, runtime)
        .await
        .map_err(|_| ApiError::internal("runtime_verify_failed"))?
    {
        return Err(ApiError::forbidden("runtime_access_forbidden"));
    }
    let receiver = state.agent_request_events.subscribe();
    let requires_ack = headers
        .get("x-colab-runtime-protocol")
        .and_then(|value| value.to_str().ok())
        == Some("2");
    Ok(upgrade.on_upgrade(move |socket| {
        runtime_socket(socket, state, user, runtime, receiver, requires_ack)
    }))

}).await
}

/// The span ends at durable receipt, not after the device's unrelated next-command wait.
async fn deliver_command(socket: &mut WebSocket, state: &AppState, user: uuid::Uuid,
    bundle: colab_server_persistence::AgentRequestBundle, requires_ack: bool) -> Result<(), ()> {
    let request_id = bundle.id;
    let runtime_id = bundle.runtime_id;
    let payload = serde_json::to_string(&serde_json::json!({
        "type":"agent.command", "command":assemble_agent_request(bundle, "dispatch")
    })).map_err(|_| ())?;
    if socket.send(Message::Text(payload.into())).await.is_err() {
        let _=state.database.release_agent_request(user,request_id).await; return Err(());
    }
    if requires_ack {
        if !wait_until_command_accepted(socket, &request_id.to_string()).await {
            let _=state.database.release_agent_request(user,request_id).await; return Err(());
        }
        match state.database.accept_agent_request(user,request_id).await {
            Ok(Some(channel_id)) => {let _=state.agent_status_events.send(AgentRequestInvalidation {channel_id,runtime_id:Some(runtime_id)});}
            _ => {let _=state.database.release_agent_request(user,request_id).await;return Err(());}
        }
    }
    Ok(())
}

/// Runtime delivery has its own protocol. A command remains releasable until Local Core confirms
/// receipt on this same socket; provider completion is reported separately after Codex finishes.
async fn runtime_socket(
    mut socket: WebSocket,
    state: AppState,
    user: uuid::Uuid,
    runtime: uuid::Uuid,
    mut receiver: broadcast::Receiver<uuid::Uuid>,
    requires_ack: bool,
) {
    *state
        .runtime_presence
        .write()
        .await
        .entry(runtime)
        .or_insert(0) += 1;
    loop {
        match state.database.claim_agent_request(user, runtime).await {
            Ok(Some(bundle)) => {
                let request_id = bundle.id;
                let envelope = bundle.trace_context.clone().unwrap_or(serde_json::Value::Null);
                let delivered = colab_observability::resume(&envelope,
                    colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.agent.delivery", async {
                        deliver_command(&mut socket, &state, user, bundle, requires_ack).await
                    })).await;
                if delivered.is_err() { break; }
                // The socket represents the device runtime, not one command delivery. Keep it
                // present while Codex works, and claim the next durable command only after Local
                // Core explicitly reports that this runtime is ready again.
                if requires_ack {
                    if !wait_until_runtime_ready(&mut socket, &request_id.to_string()).await {
                        break;
                    }
                } else {
                    // Legacy clients close after one delivered command and have no ready frame.
                    // Sending a second request here would mark it running before any client read.
                    break;
                }
            }
            Ok(None) => {}
            Err(_) => break,
        }
        tokio::select! {
            event = receiver.recv() => match event { Ok(candidate) if candidate == runtime => {}, Ok(_) => continue, Err(_) => break },
            frame = socket.recv() => match frame { Some(Ok(Message::Ping(data))) => { if socket.send(Message::Pong(data)).await.is_err(){break;} }, _ => break },
        }
    }
    let mut presence = state.runtime_presence.write().await;
    if let Some(count) = presence.get_mut(&runtime) {
        *count -= 1;
        if *count == 0 {
            presence.remove(&runtime);
        }
    }
}

async fn wait_until_command_accepted(socket: &mut WebSocket, expected_request: &str) -> bool {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return false;
        }
        match tokio::time::timeout(remaining, socket.recv()).await {
            Ok(Some(Ok(Message::Text(text)))) if command_acknowledged(&text, expected_request) => {
                return true;
            }
            Ok(Some(Ok(Message::Ping(data)))) => {
                if socket.send(Message::Pong(data)).await.is_err() {
                    return false;
                }
            }
            Ok(Some(Ok(Message::Pong(_)))) => {}
            Ok(Some(Ok(Message::Close(_)))) | Ok(Some(Err(_))) | Ok(None) | Err(_) => {
                return false;
            }
            _ => {}
        }
    }
}

async fn wait_until_runtime_ready(socket: &mut WebSocket, expected_request: &str) -> bool {
    loop {
        match socket.recv().await {
            Some(Ok(Message::Text(text))) if command_ready(&text, expected_request) => return true,
            Some(Ok(Message::Ping(data))) => {
                if socket.send(Message::Pong(data)).await.is_err() {
                    return false;
                }
            }
            Some(Ok(Message::Pong(_))) => {}
            Some(Ok(Message::Close(_))) | Some(Err(_)) | None => return false,
            _ => {}
        }
    }
}

fn command_acknowledged(text: &str, expected_request: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .is_some_and(|value| {
            value.get("type").and_then(|value| value.as_str()) == Some("agent.command.accepted")
                && value.get("requestId").and_then(|value| value.as_str()) == Some(expected_request)
        })
}

fn command_ready(text: &str, expected_request: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .is_some_and(|value| {
            value.get("type").and_then(|value| value.as_str()) == Some("agent.command.ready")
                && value.get("requestId").and_then(|value| value.as_str()) == Some(expected_request)
        })
}

async fn stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Result<impl IntoResponse, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.messaging.stream", async {

    let user = authenticated_user(&state, &headers).await?;
    let receiver = state.message_events.subscribe();
    let status_receiver = state.agent_status_events.subscribe();
    let canvas_receiver = state.canvas_events.subscribe();
    Ok(upgrade.on_upgrade(move |socket| {
        stream_socket(
            socket,
            state,
            user,
            receiver,
            status_receiver,
            canvas_receiver,
        )
    }))

}).await
}

async fn stream_socket(
    socket: WebSocket,
    state: AppState,
    user: uuid::Uuid,
    mut receiver: broadcast::Receiver<MessageInvalidation>,
    mut status_receiver: broadcast::Receiver<AgentRequestInvalidation>,
    mut canvas_receiver: broadcast::Receiver<crate::canvas::CanvasInvalidation>,
) {
    let (mut sink, mut source) = socket.split();
    let mut heartbeat = tokio::time::interval(std::time::Duration::from_secs(15));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        let event = tokio::select! {
            Ok(event) = receiver.recv() => Some((event.channel_id, serde_json::json!({"type":"messages.invalidated","channelId":event.channel_id,"latestSeq":event.latest_seq}))),
            Ok(event) = status_receiver.recv() => Some((event.channel_id, serde_json::json!({"type":"agent_requests.invalidated","channelId":event.channel_id,"runtimeId":event.runtime_id}))),
            Ok(event) = canvas_receiver.recv() => Some((event.channel_id, serde_json::json!({"type":"canvas.invalidated","channelId":event.channel_id,"canvasId":event.canvas_id,"latestSeq":event.latest_seq}))),
            _ = heartbeat.tick() => {
                // Text heartbeats traverse the Local Core bridge and are observable by the
                // browser. This lets the GUI detect a half-open TCP/WebSocket path instead of
                // waiting forever for an onclose event that proxies and sleeping laptops may
                // never produce.
                if sink.send(Message::Text(r#"{"type":"heartbeat"}"#.into())).await.is_err() {
                    break;
                }
                None
            },
            frame = source.next() => {
                match frame {
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => None,
                }
            },
        };
        let Some((channel_id, payload)) = event else {
            continue;
        };
        let allowed = state
            .database
            .list_agent_requests(user, channel_id)
            .await
            .ok()
            .flatten()
            .is_some();
        if !allowed {
            continue;
        }
        let Ok(payload) = serde_json::to_string(&payload) else {
            continue;
        };
        if sink.send(Message::Text(payload.into())).await.is_err() {
            break;
        }
    }
}

fn valid_name(value: &str) -> Result<&str, ApiError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 80 {
        Err(ApiError::bad_request("invalid_blueprint_name"))
    } else {
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        agent_mentions, agent_request_response, command_acknowledged, command_ready,
        content_plain_text,
    };
    #[test]
    fn runtime_ack_is_scoped_to_the_exact_request() {
        let request = uuid::Uuid::new_v4().to_string();
        assert!(command_acknowledged(
            &serde_json::json!({"type":"agent.command.accepted","requestId":&request}).to_string(),
            &request
        ));
        assert!(!command_acknowledged(
            &serde_json::json!({"type":"agent.command.accepted","requestId":uuid::Uuid::new_v4()})
                .to_string(),
            &request
        ));
        assert!(!command_acknowledged("not json", &request));
    }
    #[test]
    fn runtime_ready_is_scoped_to_the_exact_request() {
        let request = uuid::Uuid::new_v4().to_string();
        assert!(command_ready(
            &serde_json::json!({"type":"agent.command.ready","requestId":&request}).to_string(),
            &request
        ));
        assert!(!command_ready(
            &serde_json::json!({"type":"agent.command.ready","requestId":uuid::Uuid::new_v4()})
                .to_string(),
            &request
        ));
    }
    #[test]
    fn structured_mentions_keep_text_and_dedupe_each_agent() {
        let a = "e2045e37-1fab-445b-8ec0-82280b677c65";
        let b = "3a0bb20d-2cf2-439d-b67c-f61627819e92";
        let value = serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ask "},{"type":"mention","attrs":{"id":a,"label":"Alpha"}},{"type":"text","text":" and "},{"type":"mention","attrs":{"id":b,"label":"Beta"}},{"type":"text","text":" with "},{"type":"mention","attrs":{"id":a,"label":"Alpha"}}]}]});
        assert_eq!(
            content_plain_text(&value),
            "Ask @Alpha and @Beta with @Alpha"
        );
        assert_eq!(agent_mentions(&value).len(), 2);
    }

    #[test]
    fn runtime_prompt_contains_task_context_and_concrete_tools_only() {
        let id = uuid::Uuid::new_v4();
        let message = |seq, body: &str| colab_server_persistence::ChannelMessage {
            id: uuid::Uuid::new_v4(),
            channel_id: id,
            seq,
            body: body.into(),
            content: serde_json::json!({}),
            reply_to_message_id: None,
            sender_member_id: None,
            sender_blueprint_id: None,
            sender_name: "Lin".into(),
            sender_avatar_url: None,
            sender_kind: "member".into(),
            created_at: "now".into(),
        };
        let response = agent_request_response(colab_server_persistence::AgentRequestBundle {
            request_owner_instruction: false,
            trace_context: None,
            id,
            channel_id: id,
            target_blueprint_id: id,
            target_name: "Release Agent".into(),
            target_owner_member_id: id,
            target_owner_name: "Owner".into(),
            requester_name: "Lin".into(),
            instruction: "Check release evidence.".into(),
            runtime_id: id,
            kind: "mention".into(),
            query: "Please @Release Agent check this release.".into(),
            before_seq: Some(40),
            state: "queued".into(),
            messages: vec![
                message(40, "Earlier note"),
                message(41, "Please @Release Agent check this release."),
            ],
            quote_messages: vec![message(12, "Original request")],
        });
        assert!(
            response
                .prompt
                .starts_with("Lin: Please @Release Agent check this release.")
        );
        assert!(
            response
                .prompt
                .contains("Quoted messages:\n[Message 12 · Lin]\nOriginal request")
        );
        assert!(
            response
                .prompt
                .contains("Recent conversation:\n[Message 40 · Lin]\nEarlier note")
        );
        assert!(response.prompt.contains("colab-messages request context"));
        assert!(response.prompt.contains("colab-messages request reply"));
        assert!(!response.prompt.contains("blueprint"));
        assert!(!response.prompt.contains("automatically"));
    }
}
