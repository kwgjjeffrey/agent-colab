use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CanvasInvalidation {
    pub channel_id: uuid::Uuid,
    pub canvas_id: uuid::Uuid,
    pub latest_seq: i64,
}

#[derive(Deserialize)]
struct Page {
    #[serde(default)]
    after: i64,
    limit: Option<i64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCanvas {
    title: String,
    #[serde(default)]
    folder_id: Option<uuid::Uuid>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateFolder {
    name: String,
    #[serde(default)]
    parent_folder_id: Option<uuid::Uuid>,
}
#[derive(Deserialize)]
struct RenameResource {
    name: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveCanvas { folder_id: Option<uuid::Uuid>, index: usize }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendMention {
    target_blueprint_id: uuid::Uuid,
    section_markdown: String,
    canvas_ref: String,
    #[serde(default)]
    context_refs: Vec<super::context_prompt::ContextRef>,
    #[serde(default)]
    user_query: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CanvasAgentPrompt { prompt: String, prompt_template: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitUpdate {
    client_update_id: uuid::Uuid,
    update: String,
    device_id: Option<uuid::Uuid>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateView {
    canvas_id: uuid::Uuid,
    server_seq: i64,
    client_update_id: uuid::Uuid,
    encoding: String,
    update: String,
    byte_size: i32,
    created_at: String,
}

fn canvas_title(value: &str) -> Result<&str, ApiError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 200 {
        Err(ApiError::bad_request("invalid_canvas_title"))
    } else {
        Ok(value)
    }
}

impl From<colab_server_persistence::CanvasUpdate> for UpdateView {
    fn from(value: colab_server_persistence::CanvasUpdate) -> Self {
        Self {
            canvas_id: value.canvas_id,
            server_seq: value.server_seq,
            client_update_id: value.client_update_id,
            encoding: value.encoding,
            update: STANDARD.encode(value.update_bytes),
            byte_size: value.byte_size,
            created_at: value.created_at,
        }
    }
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route("/v1/channels/{channel_id}/canvases", get(list).post(create))
        .route("/v1/canvases/{canvas_id}", patch(rename).delete(archive))
        .route("/v1/canvases/{canvas_id}/position", patch(move_canvas))
        .route(
            "/v1/canvases/{canvas_id}/send-to-agent",
            post(send_to_agent),
        )
        .route("/v1/canvases/{canvas_id}/agent-prompt", post(agent_prompt))
        .route(
            "/v1/canvases/{canvas_id}/updates",
            get(updates).post(submit),
        )
        .route(
            "/v1/channels/{channel_id}/canvas-folders",
            get(list_folders).post(create_folder),
        )
        .route("/v1/canvas-folders/{folder_id}", patch(rename_folder))
}
async fn build_agent_prompt(state: &AppState, user: uuid::Uuid, canvas: uuid::Uuid, body: &SendMention) -> Result<(uuid::Uuid, String), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.build-agent-prompt", async {

    let (channel, channel_name, canvas_title) = state
        .database
        .canvas_command_context(user, canvas)
        .await
        .map_err(|_| ApiError::internal("canvas_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("canvas_access_forbidden"))?;
    let section = body.section_markdown.trim();
    if section.is_empty()
        || section.len() > 100_000
        || !body.canvas_ref.starts_with("colab://channel/")
    {
        return Err(ApiError::bad_request("invalid_canvas_agent_context"));
    }
    if body.context_refs.len() > 100 || body.user_query.len() > 20_000 { return Err(ApiError::bad_request("invalid_canvas_agent_context")); }
    for reference in &body.context_refs {
        if !state.database.context_reference_visible(user, channel, &reference.kind, reference.id).await.map_err(|_| ApiError::internal("context_reference_check_failed"))? { return Err(ApiError::forbidden("context_reference_unavailable")); }
    }
    let prompt = format_canvas_agent_prompt(&canvas_title, section, &body.canvas_ref, &channel_name, &super::context_prompt::instructions(channel, &body.context_refs), &body.user_query);
    Ok((channel, prompt))

}).await
}
fn format_canvas_agent_prompt(canvas_title: &str, section: &str, canvas_ref: &str, channel_name: &str, resource_tools: &str, user_query: &str) -> String {
    let command = "@COLAB_SKILL_BIN@/colab-canvas";
    let canvas_ref = canvas_ref.replace('\'', "%27");
    let channel_name = channel_name.replace('\'', "'\"'\"'");
    let prompt = format!(
        "Work on the collaborative Canvas document “{}”.\n\nRelevant heading section containing the request:\n{}\n\nTools below are at your disposal if the user task requires them.\n\nRead this document first:\n{} read --ref '{}' --offset 1 --limit 1000\n\nIf the task requires changing this document, send a Codex patch on stdin:\n{} apply-patch --ref '{}' <<'PATCH'\n*** Begin Patch\n*** Update File: document.md\n@@\n-exact existing text\n+replacement text\n*** End Patch\nPATCH\n\nIf the patch reports a conflict, read the current document and retry.\n\nTo explore other Canvas documents in this Channel:\n{} list --channel '{}'",
        canvas_title, section, command, canvas_ref, command, canvas_ref, command, channel_name
    );
    let mut prompt = format!("{prompt}\n\n{resource_tools}");
    if !user_query.trim().is_empty() { prompt.push_str("\n\nUser query:\n"); prompt.push_str(user_query.trim()); }
    prompt
}
async fn agent_prompt(
    State(state): State<AppState>, headers: HeaderMap, Path(canvas): Path<uuid::Uuid>, Json(body): Json<SendMention>,
) -> Result<Json<CanvasAgentPrompt>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.agent-prompt", async {

    let user = authenticated_user(&state, &headers).await?;
    let (_, prompt) = build_agent_prompt(&state, user, canvas, &body).await?;
    colab_observability::prompt("canvas.preview", None, &prompt, "server/standalone/crates/api/src/canvas.rs", "agent_prompt");
    Ok(Json(CanvasAgentPrompt { prompt: super::context_prompt::legacy_prompt(&prompt), prompt_template: prompt }))

}).await
}
async fn send_to_agent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(canvas): Path<uuid::Uuid>,
    Json(body): Json<SendMention>,
) -> Result<(StatusCode, Json<super::messaging::AgentRequestResponse>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.send-to-agent", async {

    let user = authenticated_user(&state, &headers).await?;
    let (channel, prompt) = build_agent_prompt(&state, user, canvas, &body).await?;
    let bundle = state
        .database
        .create_agent_request(
            user,
            channel,
            body.target_blueprint_id,
            None,
            &[],
            Some(&prompt),
            Some(&colab_observability::context_json()),
        )
        .await
        .map_err(|error| {
            eprintln!("Canvas Agent request creation failed: {error:#}");
            ApiError::internal("canvas_agent_request_failed")
        })?
        .ok_or_else(|| ApiError::forbidden("canvas_agent_request_forbidden"))?;
    let response = super::messaging::agent_request_response(bundle);
    state
        .database
        .associate_agent_request_canvas(response.id, canvas)
        .await
        .map_err(|error| {
            eprintln!("Canvas Agent request association failed: {error:#}");
            ApiError::internal("canvas_agent_request_association_failed")
        })?;
    if response.state == "queued" {
        let _ = state.agent_request_events.send(response.runtime_id);
    }
    let _ = state
        .agent_status_events
        .send(super::messaging::AgentRequestInvalidation {
            channel_id: channel,
            runtime_id: (response.state == "queued").then_some(response.runtime_id),
        });
    Ok((StatusCode::CREATED, Json(response)))

}).await
}
async fn rename(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(canvas): Path<uuid::Uuid>,
    Json(body): Json<RenameResource>,
) -> Result<Json<colab_server_persistence::Canvas>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.rename", async {

    let user = authenticated_user(&state, &headers).await?;
    let title = canvas_title(&body.name)?;
    state
        .database
        .rename_canvas(user, canvas, title)
        .await
        .map_err(|error| {
            if error.to_string().contains("duplicate key") {
                ApiError::bad_request("canvas_title_exists")
            } else {
                ApiError::internal("canvas_rename_failed")
            }
        })?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("canvas_access_forbidden"))

}).await
}
async fn archive(State(state): State<AppState>, headers: HeaderMap, Path(canvas): Path<uuid::Uuid>) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.archive", async {

    let user = authenticated_user(&state, &headers).await?;
    if state.database.archive_canvas(user, canvas).await.map_err(|_| ApiError::internal("canvas_archive_failed"))? { Ok(StatusCode::NO_CONTENT) }
    else { Err(ApiError::forbidden("canvas_access_forbidden")) }

}).await
}
async fn move_canvas(State(state): State<AppState>, headers: HeaderMap, Path(canvas): Path<uuid::Uuid>, Json(body): Json<MoveCanvas>) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.move-canvas", async {

    let user = authenticated_user(&state, &headers).await?;
    if state.database.move_canvas(user, canvas, body.folder_id, body.index).await.map_err(|error| {
        if error.to_string().contains("duplicate key") { ApiError::bad_request("canvas_title_exists_in_folder") }
        else { ApiError::internal("canvas_move_failed") }
    })? { Ok(StatusCode::NO_CONTENT) }
    else { Err(ApiError::forbidden("canvas_access_forbidden")) }

}).await
}

async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::Canvas>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.list", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_canvases(user, channel)
        .await
        .map_err(|_| ApiError::internal("canvas_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}
async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Json(body): Json<CreateCanvas>,
) -> Result<(StatusCode, Json<colab_server_persistence::Canvas>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.create", async {

    let user = authenticated_user(&state, &headers).await?;
    let title = canvas_title(&body.title)?;
    let row = state
        .database
        .create_canvas(user, channel, title, body.folder_id)
        .await
        .map_err(|_| ApiError::internal("canvas_create_failed"))?
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))?;
    Ok((StatusCode::CREATED, Json(row)))

}).await
}
async fn list_folders(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::CanvasFolder>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.list-folders", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_canvas_folders(user, channel)
        .await
        .map_err(|_| ApiError::internal("canvas_folder_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}
async fn create_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Json(body): Json<CreateFolder>,
) -> Result<(StatusCode, Json<colab_server_persistence::CanvasFolder>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.create-folder", async {

    let user = authenticated_user(&state, &headers).await?;
    let name = canvas_title(&body.name)?;
    let row = state
        .database
        .create_canvas_folder(user, channel, body.parent_folder_id, name)
        .await
        .map_err(|error| {
            if error.to_string().contains("duplicate key") {
                ApiError::bad_request("canvas_folder_name_exists")
            } else {
                ApiError::internal("canvas_folder_create_failed")
            }
        })?
        .ok_or_else(|| ApiError::forbidden("canvas_folder_access_forbidden"))?;
    Ok((StatusCode::CREATED, Json(row)))

}).await
}
async fn rename_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(folder): Path<uuid::Uuid>,
    Json(body): Json<RenameResource>,
) -> Result<Json<colab_server_persistence::CanvasFolder>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.rename-folder", async {

    let user = authenticated_user(&state, &headers).await?;
    let name = canvas_title(&body.name)?;
    state
        .database
        .rename_canvas_folder(user, folder, name)
        .await
        .map_err(|error| {
            if error.to_string().contains("duplicate key") {
                ApiError::bad_request("canvas_folder_name_exists")
            } else {
                ApiError::internal("canvas_folder_rename_failed")
            }
        })?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("canvas_folder_access_forbidden"))

}).await
}
async fn updates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(canvas): Path<uuid::Uuid>,
    Query(page): Query<Page>,
) -> Result<Json<Vec<UpdateView>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.updates", async {

    let user = authenticated_user(&state, &headers).await?;
    let rows = state
        .database
        .canvas_updates_after(user, canvas, page.after, page.limit.unwrap_or(500))
        .await
        .map_err(|_| ApiError::internal("canvas_updates_failed"))?
        .ok_or_else(|| ApiError::forbidden("canvas_access_forbidden"))?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))

}).await
}
async fn submit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(canvas): Path<uuid::Uuid>,
    Json(body): Json<SubmitUpdate>,
) -> Result<(StatusCode, Json<UpdateView>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.canvas.submit", async {

    let user = authenticated_user(&state, &headers).await?;
    let bytes = STANDARD
        .decode(body.update)
        .map_err(|_| ApiError::bad_request("invalid_canvas_update"))?;
    if bytes.is_empty() || bytes.len() > 1024 * 1024 {
        return Err(ApiError::bad_request("invalid_canvas_update_size"));
    }
    let row = state
        .database
        .append_canvas_update(user, canvas, body.client_update_id, body.device_id, &bytes)
        .await
        .map_err(|_| ApiError::internal("canvas_update_failed"))?
        .ok_or_else(|| ApiError::forbidden("canvas_access_forbidden"))?;
    if let Ok(Some(channel_id)) = state.database.canvas_channel(user, canvas).await {
        let _ = state.canvas_events.send(CanvasInvalidation {
            channel_id,
            canvas_id: canvas,
            latest_seq: row.server_seq,
        });
    }
    Ok((StatusCode::CREATED, Json(row.into())))

}).await
}

#[cfg(test)]
mod canvas_prompt_tests {
    use super::format_canvas_agent_prompt;

    #[test]
    fn preview_and_dispatch_share_the_same_prompt_builder() {
        let prompt = format_canvas_agent_prompt("Plan", "# Scope\nAsk @Agent", "colab://channel/team/canvas/Plan", "team", "How to read files:\ncolab-browser use --ref 'x'", "Append a conclusion");
        assert!(prompt.contains("Relevant heading section containing the request:\n# Scope\nAsk @Agent"));
        assert!(prompt.contains("colab-canvas read --ref 'colab://channel/team/canvas/Plan'"));
        assert!(prompt.contains("How to read files:\ncolab-browser use --ref 'x'"));
        assert!(prompt.ends_with("User query:\nAppend a conclusion"));
    }
}
