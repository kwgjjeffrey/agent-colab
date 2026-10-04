//! Local boundary for Channel Messages and Agent blueprints.
//!
//! The browser never receives the remote access token. Durable requests are authenticated here;
//! realtime frames are bridged from the Server WebSocket and remain non-authoritative hints.

use super::*;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AgentBlueprint {
    id: String,
    owner_member_id: String,
    owner_name: String,
    owner_avatar_url: Option<String>,
    name: String,
    loading_instruction: String,
    loading_command: String,
    runtime_device: Option<String>,
    runtime_agent: Option<String>,
    runtime_id: Option<String>,
    runtime_label: Option<String>,
    invocation_policy: String,
    in_channel: bool,
    editable: bool,
    updated_at: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChannelParticipant {
    member_id: String,
    display_name: String,
    email: String,
    avatar_url: Option<String>,
    is_current: bool,
    agent_count: i64,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AgentRuntime {
    id: String,
    device_id: String,
    device_name: String,
    provider: String,
    skill_version: String,
    available: bool,
    last_seen_at: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChannelMessage {
    id: String,
    channel_id: String,
    seq: i64,
    body: String,
    #[serde(default)]
    content: serde_json::Value,
    reply_to_message_id: Option<String>,
    #[serde(default)]
    sender_member_id: Option<String>,
    #[serde(default)]
    sender_blueprint_id: Option<String>,
    sender_name: String,
    sender_avatar_url: Option<String>,
    sender_kind: String,
    created_at: String,
}

pub(super) async fn participants(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
) -> Result<Json<Vec<ChannelParticipant>>, LocalError> {
    proxy_get(&state, format!("/v1/channels/{channel}/participants")).await
}
pub(super) async fn runtimes(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
) -> Result<Json<Vec<AgentRuntime>>, LocalError> {
    proxy_get(&state, format!("/v1/channels/{channel}/agent-runtimes")).await
}
pub(super) async fn blueprints(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Vec<AgentBlueprint>>, LocalError> {
    let suffix = query
        .get("ownerMemberId")
        .map(|value| format!("?owner_member_id={value}"))
        .unwrap_or_default();
    proxy_get(&state, format!("/v1/channels/{channel}/blueprints{suffix}")).await
}
pub(super) async fn create_blueprint(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    body: Json<serde_json::Value>,
) -> Result<(StatusCode, Json<AgentBlueprint>), LocalError> {
    proxy_created(
        state.inner.http.post(format!(
            "{}/v1/channels/{channel}/blueprints",
            state.inner.server_url
        )),
        &state,
        &body.0,
    )
    .await
}
pub(super) async fn update_blueprint(
    State(state): State<AppState>,
    AxumPath((channel, id)): AxumPath<(String, String)>,
    body: Json<serde_json::Value>,
) -> Result<Json<AgentBlueprint>, LocalError> {
    proxy_one(
        state.inner.http.patch(format!(
            "{}/v1/channels/{channel}/blueprints/{id}",
            state.inner.server_url
        )),
        &state,
        &body.0,
    )
    .await
}
pub(super) async fn delete_blueprint(
    State(state): State<AppState>,
    AxumPath((channel, id)): AxumPath<(String, String)>,
) -> Result<StatusCode, LocalError> {
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .delete(format!(
            "{}/v1/channels/{channel}/blueprints/{id}",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    StatusCode::from_u16(response.status().as_u16()).map_err(LocalError::internal)
}
pub(super) async fn select_blueprint(
    State(state): State<AppState>,
    AxumPath((channel, id)): AxumPath<(String, String)>,
    body: Json<serde_json::Value>,
) -> Result<StatusCode, LocalError> {
    proxy_empty(
        state.inner.http.patch(format!(
            "{}/v1/channels/{channel}/blueprints/{id}/selection",
            state.inner.server_url
        )),
        &state,
        &body.0,
    )
    .await
}
pub(super) async fn messages(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Vec<ChannelMessage>>, LocalError> {
    let mut url = format!("/v1/channels/{channel}/messages");
    if !query.is_empty() {
        url.push('?');
        url.push_str(&serde_urlencoded::to_string(query).map_err(LocalError::internal)?);
    }
    proxy_get(&state, url).await
}
pub(super) async fn message_by_id(State(state): State<AppState>, AxumPath((channel, id)): AxumPath<(String, String)>) -> Result<Json<ChannelMessage>, LocalError> {
    proxy_get(&state, format!("/v1/channels/{channel}/messages/{id}")).await
}
pub(super) async fn send_message(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    body: Json<serde_json::Value>,
) -> Result<(StatusCode, Json<ChannelMessage>), LocalError> {
    proxy_created(
        state.inner.http.post(format!(
            "{}/v1/channels/{channel}/messages",
            state.inner.server_url
        )),
        &state,
        &body.0,
    )
    .await
}
pub(super) async fn create_agent_request(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    body: Json<serde_json::Value>,
) -> Result<(StatusCode, Json<serde_json::Value>), LocalError> {
    let (status, Json(value)) = proxy_created::<serde_json::Value, _>(
        state.inner.http.post(format!(
            "{}/v1/channels/{channel}/agent-requests",
            state.inner.server_url
        )),
        &state,
        &body.0,
    )
    .await?;
    Ok((status, Json(value)))
}
pub(super) async fn agent_requests(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
) -> Result<Json<Vec<serde_json::Value>>, LocalError> {
    proxy_get(&state, format!("/v1/channels/{channel}/agent-requests")).await
}
pub(super) async fn agent_request_context(
    State(state): State<AppState>,
    AxumPath(request): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Vec<ChannelMessage>>, LocalError> {
    let suffix = serde_urlencoded::to_string(query).map_err(LocalError::internal)?;
    let response = request_owner_call(
        &state,
        reqwest::Method::GET,
        format!("/v1/agent-requests/{request}/context?{suffix}"),
        None,
    )
    .await?;
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}
pub(super) async fn agent_request_events(
    State(state): State<AppState>,
    AxumPath(request): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
    proxy_get(&state, format!("/v1/agent-requests/{request}/events")).await
}
pub(super) async fn agent_request_reply(
    State(state): State<AppState>,
    AxumPath(request): AxumPath<String>,
    body: Json<serde_json::Value>,
) -> Result<(StatusCode, Json<ChannelMessage>), LocalError> {
    let response = request_owner_call(
        &state,
        reqwest::Method::POST,
        format!("/v1/agent-requests/{request}/reply"),
        Some(body.0),
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(response.json().await.map_err(LocalError::internal)?),
    ))
}

async fn request_owner_call(
    state: &AppState,
    method: reqwest::Method,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<reqwest::Response, LocalError> {
    let user_ids: Vec<String> = {
        let store = state.inner.store.lock().await;
        let mut statement = store
            .prepare("select user_id from accounts order by last_used_at desc")
            .map_err(LocalError::internal)?;
        statement
            .query_map([], |row| row.get(0))
            .map_err(LocalError::internal)?
            .filter_map(Result::ok)
            .collect()
    };
    let mut last_forbidden = None;
    for user_id in user_ids {
        let Ok(token) = access_token_for_user(state, &user_id).await else {
            continue;
        };
        let mut request = state
            .inner
            .http
            .request(
                method.clone(),
                format!("{}{}", state.inner.server_url, path),
            )
            .bearer_auth(token);
        if let Some(body) = &body {
            request = request.json(body);
        }
        let response = request.send().await.map_err(LocalError::internal)?;
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            last_forbidden = Some(response);
            continue;
        }
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        return Ok(response);
    }
    Err(match last_forbidden {
        Some(response) => remote_error(response).await,
        None => LocalError::unauthorized("The Agent request owner must sign in again"),
    })
}

pub(super) fn start_agent_runtime(state: &AppState) {
    let state = state.clone();
    tokio::spawn(async move {
        let mut started = std::collections::HashSet::new();
        loop {
            for (user_id, runtime_id) in runtime_registrations(&state).await {
                if started.insert((user_id.clone(), runtime_id.clone())) {
                    let worker_state = state.clone();
                    tokio::spawn(async move {
                        loop {
                            if let Err(error) =
                                run_runtime_stream(&worker_state, &user_id, &runtime_id).await
                            {
                                eprintln!(
                                    "Agent runtime stream {runtime_id} for {user_id} failed: {}",
                                    error.message
                                );
                            }
                            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                        }
                    });
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });
}

async fn run_runtime_stream(
    state: &AppState,
    user_id: &str,
    runtime_id: &str,
) -> Result<(), LocalError> {
    let token = access_token_for_user(state, user_id).await?;
    let url = format!(
        "{}/v1/agent-runtimes/{runtime_id}/stream",
        state.inner.server_url
    )
    .replace("https://", "wss://")
    .replace("http://", "ws://");
    let mut request = url.into_client_request().map_err(LocalError::internal)?;
    request.headers_mut().insert(
        "authorization",
        format!("Bearer {token}")
            .parse()
            .map_err(LocalError::internal)?,
    );
    request.headers_mut().insert(
        "x-colab-runtime-protocol",
        "2".parse().map_err(LocalError::internal)?,
    );
    let (mut socket, _) = connect_async(request).await.map_err(LocalError::internal)?;
    let mut heartbeat = tokio::time::interval_at(
        tokio::time::Instant::now() + std::time::Duration::from_secs(20),
        std::time::Duration::from_secs(20),
    );
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        let frame = tokio::select! {
            frame = socket.next() => match frame {
                Some(frame) => frame.map_err(LocalError::internal)?,
                None => break,
            },
            _ = heartbeat.tick() => {
                // A local TCP socket can still say ESTABLISHED after the server or a NAT has
                // discarded it. Heartbeats turn that half-open state into a prompt write error,
                // letting the outer worker reconnect and restore authoritative presence.
                socket.send(tokio_tungstenite::tungstenite::Message::Ping(Vec::new().into()))
                    .await.map_err(LocalError::internal)?;
                continue;
            }
        };
        match frame {
            tokio_tungstenite::tungstenite::Message::Text(text) => {
                let value = serde_json::from_str::<serde_json::Value>(&text)
                    .map_err(LocalError::internal)?;
                if value.get("type").and_then(|value| value.as_str()) != Some("agent.command") {
                    continue;
                }
                let command = value
                    .get("command")
                    .ok_or_else(|| LocalError::internal("missing Agent command"))?;
                let request = command
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LocalError::internal("missing Agent request id"))?
                    .to_string();
                // Acknowledge only after the complete command has been parsed. Until this frame
                // reaches Server, disconnect recovery may safely put the claim back in the queue.
                socket
                    .send(tokio_tungstenite::tungstenite::Message::Text(
                        serde_json::json!({"type":"agent.command.accepted","requestId":request})
                            .to_string()
                            .into(),
                    ))
                    .await
                    .map_err(LocalError::internal)?;
                let completed = {
                    let store = state.inner.store.lock().await;
                    store.query_row("select exists(select 1 from agent_command_receipts where request_id=?1 and status='completed')",[&request],|row|row.get::<_,bool>(0)).unwrap_or(false)
                };
                let result = if completed {
                    report_agent_completion(state, user_id, &request).await
                } else {
                    match run_codex_request(state.clone(), user_id, command).await {
                        Ok(()) => {
                            {
                                let store = state.inner.store.lock().await;
                                store.execute("insert into agent_command_receipts(request_id,status) values(?1,'completed') on conflict(request_id) do update set status='completed',updated_at=current_timestamp",[&request]).map_err(LocalError::internal)?;
                            }
                            report_agent_completion(state, user_id, &request).await
                        }
                        Err(error) => {
                            report_agent_failure(state, user_id, &request, &error.message).await;
                            Err(error)
                        }
                    }
                };
                // Ready is distinct from accepted: it tells Server that provider execution and
                // its durable completion/failure report finished, so this same device connection
                // may receive its next command without an offline gap.
                socket
                    .send(tokio_tungstenite::tungstenite::Message::Text(
                        serde_json::json!({"type":"agent.command.ready","requestId":request})
                            .to_string()
                            .into(),
                    ))
                    .await
                    .map_err(LocalError::internal)?;
                result?;
            }
            tokio_tungstenite::tungstenite::Message::Ping(data) => {
                socket
                    .send(tokio_tungstenite::tungstenite::Message::Pong(data))
                    .await
                    .map_err(LocalError::internal)?;
            }
            tokio_tungstenite::tungstenite::Message::Close(_) => break,
            _ => {}
        }
    }
    Err(LocalError::internal("Agent runtime WebSocket disconnected"))
}

async fn runtime_registrations(state: &AppState) -> Vec<(String, String)> {
    let store = state.inner.store.lock().await;
    let mut registrations = Vec::new();
    // Account-scoped registration is the ownership record. Never guess by pairing historical
    // runtime IDs or thread bindings with every saved account: those probes create false presence,
    // repeated 403s, and make delivery depend on connection teardown races.
    let Ok(mut statement) =
        store.prepare("select key,value from local_settings where key like 'runtime_id:%:codex'")
    else {
        return Vec::new();
    };
    let Ok(rows) = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) else {
        return Vec::new();
    };
    registrations.extend(rows.filter_map(Result::ok).filter_map(|(key, runtime)| {
        key.strip_prefix("runtime_id:")
            .and_then(|rest| rest.strip_suffix(":codex"))
            .map(|user| (user.to_string(), runtime))
    }));
    registrations.sort();
    registrations.dedup();
    registrations
}

async fn report_agent_completion(
    state: &AppState,
    user_id: &str,
    request: &str,
) -> Result<(), LocalError> {
    let token = access_token_for_user(state, user_id).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/agent-requests/{request}/complete",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(remote_error(response).await)
    }
}

async fn report_agent_failure(state: &AppState, user_id: &str, request: &str, error: &str) {
    let Ok(token) = access_token_for_user(state, user_id).await else {
        return;
    };
    // Provider stderr may be huge. A bounded diagnostic releases the durable request from
    // `running`; the Server deliberately does not publish this machine-local text to the Channel.
    let bounded = error.chars().take(2000).collect::<String>();
    let _ = state
        .inner
        .http
        .post(format!(
            "{}/v1/agent-requests/{request}/fail",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .json(&serde_json::json!({"error":bounded}))
        .send()
        .await;
}

async fn run_codex_request(state: AppState, user_id: &str, value: &serde_json::Value) -> Result<(), LocalError> {
    let request_id = value
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| LocalError::internal("missing Agent request id"))?
        .to_string();
    let blueprint = value
        .get("targetBlueprintId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| LocalError::internal("missing target blueprint"))?
        .to_string();
    let runtime = value
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| LocalError::internal("missing runtime"))?
        .to_string();
    let channel = value
        .get("channelId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| LocalError::internal("missing Channel id"))?
        .to_string();
    let prompt = value
        .get("prompt")
        .and_then(|v| v.as_str())
        .ok_or_else(|| LocalError::internal("missing Agent prompt"))?
        .to_string();
    let title = value
        .get("threadTitle")
        .and_then(|v| v.as_str())
        .unwrap_or("Agent Colab task")
        .to_string();
    let binding = {
        let store = state.inner.store.lock().await;
        store.query_row("select provider_thread_id from agent_thread_bindings where channel_id=?1 and blueprint_id=?2 and adapter_version>=3",rusqlite::params![&channel,&blueprint],|row|row.get::<_,String>(0)).ok()
    };
    let runtime_dir = state
        .inner
        .data_root
        .join("agent-runtime")
        .join(&channel)
        .join(&blueprint);
    fs::create_dir_all(&runtime_dir).map_err(LocalError::internal)?;
    let submission = state
        .inner
        .codex
        .submit(super::codex_runtime::SubmitRequest {
            request_id,
            existing_thread: binding,
            cwd: runtime_dir,
            title,
            prompt,
        })
        .await
        .map_err(LocalError::internal)?;
    let thread = submission.thread_id.clone();
    {
        let store = state.inner.store.lock().await;
        // Version 3 means the binding belongs to this Local Core's persistent app-server. Older
        // bindings came from one-process-per-request adapters and cannot safely be resumed because
        // their writer ownership is not held by this process.
        store.execute("insert into agent_thread_bindings(channel_id,blueprint_id,runtime_id,provider_thread_id,adapter_version) values(?1,?2,?3,?4,3) on conflict(channel_id,blueprint_id) do update set runtime_id=excluded.runtime_id,provider_thread_id=excluded.provider_thread_id,adapter_version=excluded.adapter_version,updated_at=current_timestamp",rusqlite::params![channel,blueprint,runtime,thread]).map_err(LocalError::internal)?;
    }
    // Provider output remains in its native Codex thread. The Agent decides what belongs in the
    // Channel and publishes only that material through the request-scoped Skill command.
    let events = submission.finish().await.map_err(LocalError::internal)?;
    if let Ok(token) = access_token_for_user(&state, user_id).await {
        // Work-detail persistence is observability, not delivery. A temporary diagnostics upload
        // failure must not turn a successfully completed provider turn into a failed user request.
        let _ = state.inner.http.post(format!("{}/v1/agent-requests/{}/events",state.inner.server_url,value.get("id").and_then(|v|v.as_str()).unwrap_or_default())).bearer_auth(token).json(&serde_json::json!({"events":events.into_iter().take(2000).collect::<Vec<_>>() })).send().await;
    }
    Ok(())
}

/// Managed GUI services intentionally have a minimal PATH. Resolve the provider from explicit
/// configuration and stable per-user/application locations rather than inheriting a terminal.
pub(super) fn codex_binary() -> Option<std::ffi::OsString> {
    if let Some(value) = std::env::var_os("COLAB_CODEX_BIN") {
        if Path::new(&value).is_file() {
            return Some(value);
        }
    }
    let mut candidates = Vec::new();
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"));
        candidates.push(PathBuf::from(
            "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
        ));
        candidates.push(PathBuf::from("/opt/homebrew/bin/codex"));
        candidates.push(PathBuf::from("/usr/local/bin/codex"));
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join(".local/bin/codex"));
        candidates.push(home.join(".npm-global/bin/codex"));
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| path.into_os_string())
}

#[cfg(test)]
mod runtime_tests {
    use super::codex_binary;
    #[test]
    fn managed_service_can_find_the_installed_codex_without_shell_path() {
        assert!(codex_binary().is_some());
    }
}

async fn proxy_get<T: serde::de::DeserializeOwned>(
    state: &AppState,
    path: String,
) -> Result<Json<T>, LocalError> {
    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .get(format!("{}{path}", state.inner.server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}
async fn proxy_created<T: serde::de::DeserializeOwned, B: Serialize>(
    builder: colab_observability::RequestBuilder,
    state: &AppState,
    body: &B,
) -> Result<(StatusCode, Json<T>), LocalError> {
    let token = access_token(state).await?;
    let response = builder
        .bearer_auth(token)
        .json(body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let status = StatusCode::from_u16(response.status().as_u16()).map_err(LocalError::internal)?;
    Ok((
        status,
        Json(response.json().await.map_err(LocalError::internal)?),
    ))
}

pub(super) async fn stream(
    State(state): State<AppState>,
    upgrade: WebSocketUpgrade,
) -> Result<impl IntoResponse, LocalError> {
    let token = access_token(&state).await?;
    Ok(upgrade.on_upgrade(move |socket| bridge(socket, state, token)))
}

async fn bridge(browser: WebSocket, state: AppState, token: String) {
    let url = format!("{}/v1/messages/stream", state.inner.server_url)
        .replace("https://", "wss://")
        .replace("http://", "ws://");
    let Ok(mut request) = url.into_client_request() else {
        return;
    };
    let Ok(value) = format!("Bearer {token}").parse() else {
        return;
    };
    request.headers_mut().insert("authorization", value);
    let Ok((remote, _)) = connect_async(request).await else {
        return;
    };
    let (mut browser_sink, mut browser_source) = browser.split();
    let (mut remote_sink, mut remote_source) = remote.split();
    loop {
        tokio::select! {
            frame=remote_source.next()=>{
                let Some(Ok(frame))=frame else{break};
                let outbound=match frame{tokio_tungstenite::tungstenite::Message::Text(text)=>Message::Text(text.to_string().into()),tokio_tungstenite::tungstenite::Message::Binary(data)=>Message::Binary(data),tokio_tungstenite::tungstenite::Message::Close(_)=>break,_=>continue};
                if browser_sink.send(outbound).await.is_err(){break}
            }
            frame=browser_source.next()=>{
                // The browser does not publish durable messages over this socket.  We still read
                // close/ping frames so a closed tab tears down its authenticated remote socket.
                match frame {
                    Some(Ok(Message::Ping(data)))=>{if remote_sink.send(tokio_tungstenite::tungstenite::Message::Ping(data)).await.is_err(){break}},
                    Some(Ok(Message::Close(_)))|None|Some(Err(_))=>break,
                    _=>{}
                }
            }
        }
    }
}
