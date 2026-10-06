use super::*;

pub(super) async fn create(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/channels/{channel}/invite-links",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let mut value: serde_json::Value = response.json().await.map_err(LocalError::internal)?;
    let token = value["token"]
        .as_str()
        .ok_or_else(|| LocalError::internal("missing invitation capability"))?;
    value["url"] = serde_json::json!(format!("{}/invite/{token}", state.inner.server_url));
    Ok(Json(value))
}
#[derive(Deserialize)]
pub(super) struct Accept {
    token: String,
}
pub(super) async fn accept(
    State(state): State<AppState>,
    Json(body): Json<Accept>,
) -> Result<Json<serde_json::Value>, LocalError> {
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .post(format!("{}/v1/invite-links/accept", state.inner.server_url))
        .bearer_auth(token)
        .json(&serde_json::json!({"token":body.token}))
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let value: serde_json::Value = response.json().await.map_err(LocalError::internal)?;
    let organization = value["organizationId"]
        .as_str()
        .ok_or_else(|| LocalError::internal("missing invitation organization"))?;
    set_current_organization(&state, organization).await?;
    Ok(Json(value))
}
pub(super) async fn revoke(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .delete(format!("{}/v1/invite-links/{id}", state.inner.server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(StatusCode::NO_CONTENT)
}
