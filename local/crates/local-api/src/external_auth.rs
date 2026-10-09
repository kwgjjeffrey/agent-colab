//! External login uses a loopback callback and PKCE; only Core persists Server sessions.
use super::*;

pub(super) fn required() -> bool { std::env::var("COLAB_EXTERNAL_AUTH_REQUIRED").is_ok_and(|v| v == "1") }

pub(super) struct Pending {
    verifier: String,
    redirect_uri: String,
    link_user_id: Option<String>,
    started: std::time::Instant,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Provider { authorization_url: String }

pub(super) async fn start(State(state): State<AppState>) -> Result<Json<StartResponse>, LocalError> {
    let response = state.inner.http.get(format!("{}/v1/auth/external/config", state.inner.server_url)).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() { return Err(remote_error(response).await); }
    let provider: Provider = response.json().await.map_err(LocalError::internal)?;
    let mut url = Url::parse(&provider.authorization_url).map_err(LocalError::internal)?;
    if url.scheme() != "https" || url.host_str().is_none() || url.username() != "" || url.password().is_some() || url.query().is_some() || url.fragment().is_some() { return Err(LocalError::internal("Invalid external authorization endpoint")); }
    let mut redirect = Url::parse(&state.inner.callback_url).map_err(LocalError::internal)?;
    redirect.set_host(Some("127.0.0.1")).map_err(LocalError::internal)?;
    redirect.set_path("/v1/auth/external/callback"); redirect.set_query(None); redirect.set_fragment(None);
    let verifier = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let flow = Uuid::new_v4().simple().to_string();
    let link_user_id = state.inner.session.lock().await.as_ref().map(|s| s.user.id.clone());
    url.query_pairs_mut().append_pair("state", &flow).append_pair("redirect_uri", redirect.as_str()).append_pair("code_challenge", &URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))).append_pair("code_challenge_method", "S256").append_pair("intent", if link_user_id.is_some() { "link" } else { "login" });
    let mut pending = state.inner.external_pending.lock().await;
    pending.retain(|_, p| p.started.elapsed() < std::time::Duration::from_secs(300));
    if pending.len() >= 16 { return Err(LocalError::bad_request("Too many pending logins")); }
    pending.insert(flow, Pending { verifier, redirect_uri: redirect.into(), link_user_id, started: std::time::Instant::now() });
    *state.inner.last_error.lock().await = None;
    Ok(Json(StartResponse { authorization_url: url.into() }))
}

pub(super) async fn callback(State(state): State<AppState>, Query(query): Query<CallbackQuery>) -> Result<Html<&'static str>, LocalError> {
    let result = complete(&state, query).await;
    if let Err(error) = &result { *state.inner.last_error.lock().await = Some(error.message.clone()); }
    result?;
    Ok(Html("<!doctype html><meta charset='utf-8'><title>Signed in</title><h2>登录成功</h2><p>可以关闭此页，返回桌面应用。GUI 和 Skill 已使用同一账户。</p>"))
}
async fn complete(state: &AppState, query: CallbackQuery) -> Result<(), LocalError> {
    let flow = query.state.ok_or_else(|| LocalError::bad_request("Missing login state"))?;
    let pending = state.inner.external_pending.lock().await.remove(&flow).ok_or_else(|| LocalError::bad_request("Unknown or consumed login state"))?;
    if pending.started.elapsed() > std::time::Duration::from_secs(300) { return Err(LocalError::bad_request("Login request expired")); }
    if query.error.is_some() { return Err(LocalError::bad_request("External login rejected")); }
    let code = query.code.ok_or_else(|| LocalError::bad_request("Missing authorization code"))?;
    let _switch = state.inner.account_switch_lock.lock().await;
    let active = state.inner.session.lock().await.as_ref().map(|s| s.user.id.clone());
    if active != pending.link_user_id { return Err(LocalError::bad_request("Account changed during login; start again")); }
    let mut request = state.inner.http.post(format!("{}/v1/auth/external/session", state.inner.server_url)).json(&serde_json::json!({ "code": code, "codeVerifier": pending.verifier, "redirectUri": pending.redirect_uri }));
    if let Some(user) = &pending.link_user_id { request = request.bearer_auth(access_token_for_user(state, user).await?); }
    let response = request.send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() { return Err(remote_error(response).await); }
    let session: ColabSession = response.json().await.map_err(LocalError::internal)?;
    device_auth::bind_current(state, &session).await?;
    device_auth::login_account(state, &session.user.id).await?;
    *state.inner.last_error.lock().await = None;
    Ok(())
}
