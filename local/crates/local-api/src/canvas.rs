use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use yrs::{
    Doc, OffsetKind, Options, ReadTxn, StateVector, Transact, Update, updates::decoder::Decode,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Canvas {
    id: String,
    channel_id: String,
    title: String,
    #[serde(default)]
    created_by_member_id: Option<String>,
    #[serde(default)]
    creator_name: Option<String>,
    folder_id: Option<String>,
    schema_version: i32,
    last_server_seq: i64,
    can_edit: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateCanvas {
    title: String,
    #[serde(default)]
    folder_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CanvasFolder {
    id: String,
    channel_id: String,
    parent_folder_id: Option<String>,
    name: String,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateFolder {
    name: String,
    parent_folder_id: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub(super) struct RenameResource {
    name: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MoveCanvas { folder_id: Option<String>, index: usize }

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CanvasUpdate {
    canvas_id: String,
    server_seq: i64,
    client_update_id: String,
    encoding: String,
    update: String,
    byte_size: i32,
    created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SubmitUpdate {
    client_update_id: Option<String>,
    update: String,
    device_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SubmitUpdateRemote<'a> {
    client_update_id: &'a str,
    update: &'a str,
    device_id: Option<&'a str>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PatchRequest {
    patch: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DocumentView {
    path: &'static str,
    revision: String,
    content: String,
    last_server_seq: i64,
    sync_state: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PatchResult {
    status: &'static str,
    revision: String,
    last_server_seq: i64,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SendMention {
    target_blueprint_id: String,
    section_markdown: String,
    canvas_ref: String,
    #[serde(default)]
    context_refs: Vec<serde_json::Value>,
    #[serde(default)]
    user_query: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CanvasAgentPrompt { prompt: String, #[serde(default)] prompt_template: Option<String> }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AgentRequest {
    id: String,
    state: String,
    prompt: String,
    runtime_id: String,
    target_blueprint_id: String,
    thread_title: String,
}

#[derive(Deserialize)]
pub(super) struct UpdatePage {
    #[serde(default)]
    after: i64,
    limit: Option<i64>,
}

pub(super) async fn list_canvases(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
) -> Result<Json<Vec<Canvas>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.list-canvases", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/channels/{channel}/canvases",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await;
    collaboration::cached_discovery(&state, format!("canvases:{channel}"), response).await

}).await
}

pub(super) async fn create_canvas(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    Json(body): Json<CreateCanvas>,
) -> Result<(StatusCode, Json<Canvas>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.create-canvas", async {

    let Json(canvas) = proxy_one(
        state.inner.http.post(format!(
            "{}/v1/channels/{channel}/canvases",
            state.inner.server_url
        )),
        &state,
        &body,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(canvas)))

}).await
}

pub(super) async fn rename_canvas(
    State(state): State<AppState>,
    AxumPath(canvas): AxumPath<String>,
    Json(body): Json<RenameResource>,
) -> Result<Json<Canvas>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.rename-canvas", async {

    proxy_one(
        state
            .inner
            .http
            .patch(format!("{}/v1/canvases/{canvas}", state.inner.server_url)),
        &state,
        &body,
    )
    .await

}).await
}
pub(super) async fn archive_canvas(State(state): State<AppState>, AxumPath(canvas): AxumPath<String>) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.archive-canvas", async {

    let token = access_token(&state).await?;
    let response = state.inner.http.delete(format!("{}/v1/canvases/{canvas}", state.inner.server_url)).bearer_auth(token).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() { return Err(remote_error(response).await); }
    Ok(StatusCode::NO_CONTENT)

}).await
}
pub(super) async fn move_canvas(State(state): State<AppState>, AxumPath(canvas): AxumPath<String>, Json(body): Json<MoveCanvas>) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.move-canvas", async {

    let token = access_token(&state).await?;
    let response = state.inner.http.patch(format!("{}/v1/canvases/{canvas}/position", state.inner.server_url)).bearer_auth(token).json(&body).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() { return Err(remote_error(response).await); }
    Ok(StatusCode::NO_CONTENT)

}).await
}
pub(super) async fn send_to_agent(
    State(state): State<AppState>,
    AxumPath(canvas): AxumPath<String>,
    Json(body): Json<SendMention>,
) -> Result<(StatusCode, Json<AgentRequest>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.send-to-agent", async {

    let Json(row) = proxy_one(
        state.inner.http.post(format!(
            "{}/v1/canvases/{canvas}/send-to-agent",
            state.inner.server_url
        )),
        &state,
        &body,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(row)))

}).await
}
pub(super) async fn agent_prompt(
    State(state): State<AppState>,
    AxumPath(canvas): AxumPath<String>,
    Json(body): Json<SendMention>,
) -> Result<Json<CanvasAgentPrompt>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.agent-prompt", async {

    let Json(mut value): Json<CanvasAgentPrompt> = proxy_one(
        state.inner.http.post(format!("{}/v1/canvases/{canvas}/agent-prompt", state.inner.server_url)),
        &state,
        &body,
    ).await?;
    value.prompt = super::runtime_tools::bind(value.prompt_template.as_deref().unwrap_or(&value.prompt))?;
    Ok(Json(value))

}).await
}

pub(super) async fn list_folders(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
) -> Result<Json<Vec<CanvasFolder>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.list-folders", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/channels/{channel}/canvas-folders",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await;
    collaboration::cached_discovery(&state, format!("canvas-folders:{channel}"), response).await

}).await
}

pub(super) async fn create_folder(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    Json(body): Json<CreateFolder>,
) -> Result<(StatusCode, Json<CanvasFolder>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.create-folder", async {

    let Json(folder) = proxy_one(
        state.inner.http.post(format!(
            "{}/v1/channels/{channel}/canvas-folders",
            state.inner.server_url
        )),
        &state,
        &body,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(folder)))

}).await
}

pub(super) async fn rename_folder(
    State(state): State<AppState>,
    AxumPath(folder): AxumPath<String>,
    Json(body): Json<RenameResource>,
) -> Result<Json<CanvasFolder>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.rename-folder", async {

    proxy_one(
        state.inner.http.patch(format!(
            "{}/v1/canvas-folders/{folder}",
            state.inner.server_url
        )),
        &state,
        &body,
    )
    .await

}).await
}

pub(super) async fn updates(
    State(state): State<AppState>,
    AxumPath(canvas): AxumPath<String>,
    Query(page): Query<UpdatePage>,
) -> Result<Json<Vec<CanvasUpdate>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.updates", async {

    let account = current_user_id(&state).await?;
    // A reconnecting GUI first causes Local Core to replay its durable outbox. Failure is kept in
    // SQLite and surfaced, never converted into a false `Synced` response.
    flush_outbox(&state, &account, &canvas).await?;
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/canvases/{canvas}/updates",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .query(&[("after", page.after), ("limit", page.limit.unwrap_or(500))])
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))

}).await
}

pub(super) async fn submit_update(
    State(state): State<AppState>,
    AxumPath(canvas): AxumPath<String>,
    Json(body): Json<SubmitUpdate>,
) -> Result<(StatusCode, Json<CanvasUpdate>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.submit-update", async {

    let account = current_user_id(&state).await?;
    let client_update_id = body
        .client_update_id
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let bytes = STANDARD
        .decode(&body.update)
        .map_err(|_| LocalError::bad_request("invalid_canvas_update"))?;
    if bytes.is_empty() || bytes.len() > 1024 * 1024 {
        return Err(LocalError::bad_request("invalid_canvas_update_size"));
    }
    persist_outbox(&state, &account, &canvas, &client_update_id, &bytes).await?;
    apply_local_update(&state, &account, &canvas, &bytes).await?;
    let row = send_outbox_item(
        &state,
        &account,
        &canvas,
        &client_update_id,
        body.device_id.as_deref(),
    )
    .await?;
    merge_remote_update(&state, &account, &canvas, &row).await?;
    Ok((StatusCode::CREATED, Json(row)))

}).await
}

pub(super) async fn read_document(
    State(state): State<AppState>,
    AxumPath(canvas): AxumPath<String>,
) -> Result<Json<DocumentView>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.read-document", async {

    let account = current_user_id(&state).await?;
    sync_replica(&state, &account, &canvas).await?;
    flush_outbox(&state, &account, &canvas).await?;
    let (doc, seq) = load_replica(&state, &account, &canvas).await?;
    if doc.transact().has_missing_updates() {
        return Err(LocalError::internal("Canvas synchronization is incomplete; document dependencies are missing"));
    }
    let content = render(&doc).map_err(LocalError::internal)?;
    let revision = projection_revision(&content);
    let pending = pending_count(&state, &account, &canvas).await?;
    Ok(Json(DocumentView {
        path: "document.md",
        revision,
        content,
        last_server_seq: seq,
        sync_state: if pending == 0 {
            "synced"
        } else {
            "saved_locally"
        },
    }))

}).await
}

pub(super) async fn apply_patch(
    State(state): State<AppState>,
    AxumPath(canvas): AxumPath<String>,
    Json(body): Json<PatchRequest>,
) -> Result<Json<PatchResult>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.apply-patch", async {

    let account = current_user_id(&state).await?;
    sync_replica(&state, &account, &canvas).await?;
    let (doc, _) = load_replica(&state, &account, &canvas).await?;
    let (old, new) = parse_single_replacement(&body.patch)?;
    let update =
        patch_text(&doc, &old, &new).map_err(|error| LocalError::conflict(error.to_string()))?;
    let client_update_id = Uuid::new_v4().to_string();
    persist_outbox(&state, &account, &canvas, &client_update_id, &update).await?;
    save_replica_doc(&state, &account, &canvas, &doc, None).await?;
    let row = send_outbox_item(&state, &account, &canvas, &client_update_id, None).await?;
    save_replica_doc(&state, &account, &canvas, &doc, Some(row.server_seq)).await?;
    if doc.transact().has_missing_updates() {
        return Err(LocalError::internal("Canvas synchronization is incomplete; document dependencies are missing"));
    }
    let content = render(&doc).map_err(LocalError::internal)?;
    Ok(Json(PatchResult {
        status: "Done",
        revision: projection_revision(&content),
        last_server_seq: row.server_seq,
    }))

}).await
}

async fn remote_updates(
    state: &AppState,
    canvas: &str,
    after: i64,
) -> Result<Vec<CanvasUpdate>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.remote-updates", async {

    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/canvases/{canvas}/updates",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .query(&[("after", after), ("limit", 1000_i64)])
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    response.json().await.map_err(LocalError::internal)

}).await
}

async fn sync_replica(state: &AppState, account: &str, canvas: &str) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.sync-replica", async {

    let (doc, mut seq) = load_replica(state, account, canvas).await?;
    // Legacy cursors could skip dependencies. Replay without discarding local edits.
    if doc.transact().has_missing_updates() { seq = 0; }
    loop {
        let rows = remote_updates(state, canvas, seq).await?;
        if rows.is_empty() {
            break;
        }
        for row in &rows {
            if row.server_seq != seq + 1 {
                return Err(LocalError::internal("Canvas update sequence has a gap"));
            }
            let bytes = STANDARD.decode(&row.update).map_err(LocalError::internal)?;
            doc.transact_mut()
                .apply_update(Update::decode_v1(&bytes).map_err(LocalError::internal)?)
                .map_err(LocalError::internal)?;
            seq = seq.max(row.server_seq);
        }
        save_replica_doc(state, account, canvas, &doc, Some(seq)).await?;
        if rows.len() < 1000 {
            break;
        }
    }
    Ok(())

}).await
}

async fn merge_remote_update(
    state: &AppState,
    account: &str,
    canvas: &str,
    row: &CanvasUpdate,
) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.merge-remote-update", async {

    let (doc, _) = load_replica(state, account, canvas).await?;
    let bytes = STANDARD.decode(&row.update).map_err(LocalError::internal)?;
    doc.transact_mut()
        .apply_update(Update::decode_v1(&bytes).map_err(LocalError::internal)?)
        .map_err(LocalError::internal)?;
    // An ACK confirms this update, not receipt of its predecessors.
    save_replica_doc(state, account, canvas, &doc, None).await

}).await
}

async fn apply_local_update(
    state: &AppState,
    account: &str,
    canvas: &str,
    bytes: &[u8],
) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.apply-local-update", async {

    let (doc, _) = load_replica(state, account, canvas).await?;
    doc.transact_mut()
        .apply_update(Update::decode_v1(bytes).map_err(LocalError::internal)?)
        .map_err(LocalError::internal)?;
    save_replica_doc(state, account, canvas, &doc, None).await

}).await
}

fn new_doc() -> Doc {
    Doc::with_options(Options {
        offset_kind: OffsetKind::Utf16,
        ..Options::default()
    })
}

async fn load_replica(
    state: &AppState,
    account: &str,
    canvas: &str,
) -> Result<(Doc, i64), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.load-replica", async {

    let stored = {
        let store = state.inner.store.lock().await;
        store.query_row("select snapshot_bytes,last_server_seq from canvas_replicas where account_id=?1 and canvas_id=?2", rusqlite::params![account, canvas], |row| Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, i64>(1)?))).ok()
    };
    let doc = new_doc();
    if let Some((bytes, seq)) = stored {
        if !bytes.is_empty() {
            doc.transact_mut()
                .apply_update(Update::decode_v1(&bytes).map_err(LocalError::internal)?)
                .map_err(LocalError::internal)?;
        }
        Ok((doc, seq))
    } else {
        Ok((doc, 0))
    }

}).await
}

async fn save_replica_doc(
    state: &AppState,
    account: &str,
    canvas: &str,
    doc: &Doc,
    seq: Option<i64>,
) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.save-replica-doc", async {

    let store = state.inner.store.lock().await;
    save_replica_locked(&store, account, canvas, doc, seq)?;
    Ok(())

}).await
}

fn save_replica_locked(store: &rusqlite::Connection, account: &str, canvas: &str, doc: &Doc, seq: Option<i64>) -> Result<(), LocalError> {
    // HTTP callers can hold different baselines. Merge with the latest replica
    // under the writer lock so saving one cannot erase another caller's edits.
    let existing = store.query_row("select snapshot_bytes from canvas_replicas where account_id=?1 and canvas_id=?2", rusqlite::params![account,canvas], |row| row.get::<_,Vec<u8>>(0)).ok();
    if let Some(bytes) = existing {
        doc.transact_mut().apply_update(Update::decode_v1(&bytes).map_err(LocalError::internal)?).map_err(LocalError::internal)?;
    }
    let snapshot = doc.transact().encode_state_as_update_v1(&StateVector::default());
    store.execute("insert into canvas_replicas(account_id,canvas_id,snapshot_bytes,last_server_seq) values(?1,?2,?3,coalesce(?4,0)) on conflict(account_id,canvas_id) do update set snapshot_bytes=excluded.snapshot_bytes,last_server_seq=max(coalesce(?4,0),canvas_replicas.last_server_seq),updated_at=current_timestamp", rusqlite::params![account, canvas, snapshot, seq]).map_err(LocalError::internal)?;
    Ok(())
}

#[cfg(test)]
mod replica_recovery_tests {
    use super::*;
    use yrs::{Text, GetString};
    #[test]
    fn dependent_only_replica_recovers_without_losing_the_local_delta() {
        let source=new_doc();let text=source.get_or_insert_text("test");
        text.insert(&mut source.transact_mut(),0,"Planning");
        let seed=source.transact().encode_state_as_update_v1(&StateVector::default());
        let vector=source.transact().state_vector();
        text.insert(&mut source.transact_mut(),8," items");
        let delta=source.transact().encode_state_as_update_v1(&vector);
        let replica=new_doc();replica.transact_mut().apply_update(Update::decode_v1(&delta).unwrap()).unwrap();
        assert!(replica.transact().has_missing_updates());
        let retained=replica.transact().encode_state_as_update_v1(&StateVector::default());
        let restored=new_doc();restored.transact_mut().apply_update(Update::decode_v1(&retained).unwrap()).unwrap();
        restored.transact_mut().apply_update(Update::decode_v1(&seed).unwrap()).unwrap();
        assert!(!restored.transact().has_missing_updates());
        assert_eq!(restored.get_or_insert_text("test").get_string(&restored.transact()),"Planning items");
    }
    #[test]
    fn stale_saves_merge_and_upload_ack_does_not_advance_cursor() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("create table canvas_replicas(account_id text,canvas_id text,snapshot_bytes blob,last_server_seq integer,updated_at text,primary key(account_id,canvas_id));").unwrap();
        let first = new_doc();
        first.get_or_insert_text("test").insert(&mut first.transact_mut(),0,"A");
        let second = new_doc();
        second.get_or_insert_text("test").insert(&mut second.transact_mut(),0,"B");
        save_replica_locked(&db,"u","c",&first,Some(4)).unwrap();
        save_replica_locked(&db,"u","c",&second,None).unwrap();
        save_replica_locked(&db,"u","c",&first,Some(2)).unwrap();
        let (bytes,seq):(Vec<u8>,i64) = db.query_row("select snapshot_bytes,last_server_seq from canvas_replicas",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
        let result=new_doc();
        result.transact_mut().apply_update(Update::decode_v1(&bytes).unwrap()).unwrap();
        let text=result.get_or_insert_text("test").get_string(&result.transact());
        assert!(text.contains('A') && text.contains('B'));
        assert_eq!(seq,4);
    }
}

async fn persist_outbox(
    state: &AppState,
    account: &str,
    canvas: &str,
    id: &str,
    bytes: &[u8],
) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.persist-outbox", async {

    let store = state.inner.store.lock().await;
    store.execute("insert into canvas_outbox(account_id,canvas_id,client_update_id,update_bytes,state,next_attempt_at,trace_context) values(?1,?2,?3,?4,'pending',unixepoch(),?5) on conflict do nothing", rusqlite::params![account, canvas, id, bytes, colab_observability::context_json().to_string()]).map_err(LocalError::internal)?;
    Ok(())

}).await
}

async fn send_outbox_item(
    state: &AppState,
    account: &str,
    canvas: &str,
    id: &str,
    device: Option<&str>,
) -> Result<CanvasUpdate, LocalError> {

    let (bytes, envelope) = {
        let store = state.inner.store.lock().await;
        store.query_row("select update_bytes,trace_context from canvas_outbox where account_id=?1 and canvas_id=?2 and client_update_id=?3", rusqlite::params![account, canvas, id], |row| Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, Option<String>>(1)?))).map_err(LocalError::internal)?
    };
    let context = envelope.and_then(|raw|serde_json::from_str(&raw).ok()).unwrap_or_default();
    colab_observability::resume(&context, colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.send-outbox-item", async {

    let encoded = STANDARD.encode(bytes);
    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/canvases/{canvas}/updates",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .json(&SubmitUpdateRemote {
            client_update_id: id,
            update: &encoded,
            device_id: device,
        })
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let row: CanvasUpdate = response.json().await.map_err(LocalError::internal)?;
    let store = state.inner.store.lock().await;
    store.execute("update canvas_outbox set state='acked',server_seq=?4,attempt_count=attempt_count+1,last_error=null,updated_at=current_timestamp where account_id=?1 and canvas_id=?2 and client_update_id=?3", rusqlite::params![account, canvas, id, row.server_seq]).map_err(LocalError::internal)?;
    Ok(row)
    })).await
}

async fn flush_outbox(state: &AppState, account: &str, canvas: &str) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.flush-outbox", async {

    let ids = {
        let store = state.inner.store.lock().await;
        let mut stmt = store.prepare("select client_update_id from canvas_outbox where account_id=?1 and canvas_id=?2 and state='pending' order by created_at").map_err(LocalError::internal)?;
        stmt.query_map(rusqlite::params![account, canvas], |row| {
            row.get::<_, String>(0)
        })
        .map_err(LocalError::internal)?
        .filter_map(Result::ok)
        .collect::<Vec<_>>()
    };
    for id in ids {
        let _ = send_outbox_item(state, account, canvas, &id, None).await?;
    }
    Ok(())

}).await
}

async fn pending_count(state: &AppState, account: &str, canvas: &str) -> Result<i64, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.pending-count", async {

    let store = state.inner.store.lock().await;
    store.query_row("select count(*) from canvas_outbox where account_id=?1 and canvas_id=?2 and state='pending'", rusqlite::params![account, canvas], |row| row.get(0)).map_err(LocalError::internal)

}).await
}

pub(super) fn start_sync(state: &AppState) {
    let state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            interval.tick().await;
            let Ok(account) = current_user_id(&state).await else {
                continue;
            };
            let canvases = {
                let store = state.inner.store.lock().await;
                let Ok(mut statement) = store.prepare("select distinct canvas_id from canvas_outbox where account_id=?1 and state='pending' and next_attempt_at<=unixepoch()") else { continue };
                let Ok(rows) = statement.query_map([&account], |row| row.get::<_, String>(0))
                else {
                    continue;
                };
                rows.filter_map(Result::ok).collect::<Vec<_>>()
            };
            for canvas in canvases {
                if let Err(error) = flush_outbox(&state, &account, &canvas).await {
                    let store = state.inner.store.lock().await;
                    let _ = store.execute("update canvas_outbox set attempt_count=attempt_count+1,next_attempt_at=unixepoch()+min(60,(1 << min(attempt_count,6))),last_error=?3,updated_at=current_timestamp where account_id=?1 and canvas_id=?2 and state='pending'", rusqlite::params![account, canvas, error.message]);
                }
            }
        }
    });
}

fn projection_revision(content: &str) -> String {
    format!(
        "projection:{}",
        hex::encode(Sha256::digest(content.as_bytes()))
    )
}

fn parse_single_replacement(patch: &str) -> Result<(String, String), LocalError> {
    if !patch.contains("*** Begin Patch")
        || !patch.contains("*** Update File: document.md")
        || !patch.contains("*** End Patch")
    {
        return Err(LocalError::bad_request(
            "invalid_patch: target must be document.md",
        ));
    }
    let mut old = Vec::new();
    let mut new = Vec::new();
    let mut in_hunk = false;
    for line in patch.lines() {
        if line.starts_with("@@") {
            if in_hunk {
                return Err(LocalError::bad_request(
                    "invalid_patch: use one hunk per call",
                ));
            }
            in_hunk = true;
            continue;
        }
        if !in_hunk || line.starts_with("*** End Patch") {
            continue;
        }
        if let Some(value) = line.strip_prefix('-') {
            old.push(value);
        } else if let Some(value) = line.strip_prefix('+') {
            new.push(value);
        } else if let Some(value) = line.strip_prefix(' ') {
            old.push(value);
            new.push(value);
        }
    }
    if old.is_empty() {
        return Err(LocalError::bad_request(
            "invalid_patch: at least one removed/context line is required",
        ));
    }
    Ok((old.join("\n"), new.join("\n")))
}

fn render(doc: &Doc) -> anyhow::Result<String> {
    super::canvas_codec::render(doc)
}
fn patch_text(doc: &Doc, old: &str, new: &str) -> anyhow::Result<Vec<u8>> {
    super::canvas_codec::patch(doc, old, new)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_codex_patch_contract() {
        let patch = "*** Begin Patch\n*** Update File: document.md\n@@\n-old\n+new\n*** End Patch";
        assert_eq!(
            parse_single_replacement(patch).unwrap(),
            ("old".into(), "new".into())
        );
    }
    #[test]
    fn rejects_other_virtual_files() {
        assert!(
            parse_single_replacement(
                "*** Begin Patch\n*** Update File: notes.md\n@@\n-a\n+b\n*** End Patch"
            )
            .is_err()
        );
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LocalReplica { update: String, last_server_seq: i64, pending: i64 }

// GUI hydration is separate from remote cursor repair: a local snapshot contains unsent edits
// and must never be represented as an acknowledged Server update or a Synced state.
pub(super) async fn local_replica(
    State(state): State<AppState>, AxumPath(canvas): AxumPath<String>,
) -> Result<Json<LocalReplica>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.canvas.local-replica", async {
    let account = current_user_id(&state).await?;
    {
        let store = state.inner.store.lock().await;
        store.query_row("select 1 from canvas_replicas where account_id=?1 and canvas_id=?2", rusqlite::params![account, canvas], |_| Ok(()))
            .map_err(|_| LocalError { status: StatusCode::NOT_FOUND, message: "No local Canvas replica for this account".into() })?;
    }
    let (doc, last_server_seq) = load_replica(&state, &account, &canvas).await?;
    let bytes = doc.transact().encode_state_as_update_v1(&StateVector::default());
    let pending = pending_count(&state, &account, &canvas).await?;
    Ok(Json(LocalReplica { update: STANDARD.encode(bytes), last_server_seq, pending }))
}).await
}
