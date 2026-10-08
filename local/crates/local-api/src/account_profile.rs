use super::*;

pub(super) async fn get(State(state): State<AppState>) -> Result<Json<serde_json::Value>, LocalError> {
    profile(&state, None).await
}

pub(super) async fn update(State(state): State<AppState>, Json(body): Json<serde_json::Value>) -> Result<Json<serde_json::Value>, LocalError> {
    profile(&state, Some(body)).await
}

async fn profile(state: &AppState, body: Option<serde_json::Value>) -> Result<Json<serde_json::Value>, LocalError> {
    // Bind the remote mutation and local session projection to the same selected account.
    let _guard = state.inner.account_switch_lock.lock().await;
    let token = access_token(state).await?;
    let url = format!("{}/v1/auth/profile", state.inner.server_url);
    let request = if let Some(body) = body { state.inner.http.patch(url).json(&body) } else { state.inner.http.get(url) };
    let response = request.bearer_auth(token).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() { return Err(remote_error(response).await); }
    let value: serde_json::Value = response.json().await.map_err(LocalError::internal)?;
    let user: User = serde_json::from_value(value.clone()).map_err(LocalError::internal)?;
    let mut session = state.inner.session.lock().await.clone().ok_or_else(|| LocalError::bad_request("not signed in"))?;
    if session.user.id != user.id { return Err(LocalError::internal("profile account mismatch")); }
    session.user = user;
    auth::save_account(state, &session).await?;
    *state.inner.session.lock().await = Some(session);
    Ok(Json(value))
}
