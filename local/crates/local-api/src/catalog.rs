use super::*;

pub(super) async fn children(
    State(state): State<AppState>, AxumPath(channel): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, LocalError> {
    let token = access_token(&state).await?;
    let response = state.inner.http.get(format!("{}/v1/channels/{channel}/catalog-items", state.inner.server_url))
        .query(&query).bearer_auth(token).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() { return Err(remote_error(response).await); }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}

pub(super) async fn place(
    State(state): State<AppState>, AxumPath(channel): AxumPath<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, LocalError> {
    proxy_empty(state.inner.http.patch(format!("{}/v1/channels/{channel}/catalog-items/position", state.inner.server_url)), &state, &body).await
}
