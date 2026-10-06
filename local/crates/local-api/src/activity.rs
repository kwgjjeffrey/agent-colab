use super::*;

pub(super) async fn list(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, LocalError> {
    Uuid::parse_str(&channel).map_err(|_| LocalError::bad_request("Invalid Channel ID"))?;
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/channels/{channel}/activity",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .query(&query)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}
/// Best-effort consumption metadata must not turn a successful read into a failed task.
/// Use the account captured by the read, never the account selected later in the GUI.
pub(super) async fn record_read(state: &AppState, share: &str, user: &str) -> bool {
    let Ok(token) = access_token_for_user(state, user).await else {
        return false;
    };
    state
        .inner
        .http
        .post(format!(
            "{}/v1/shares/{share}/read-activity",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .is_ok_and(|r| r.status().is_success())
}
pub(super) async fn record_local_read(
    State(state): State<AppState>,
    AxumPath(share): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
    Uuid::parse_str(&share).map_err(|_| LocalError::bad_request("Invalid Share ID"))?;
    let user = current_user_id(&state).await?;
    Ok(Json(
        serde_json::json!({"recorded":record_read(&state,&share,&user).await}),
    ))
}
