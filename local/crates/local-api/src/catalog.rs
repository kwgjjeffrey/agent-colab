use super::*;
pub(super) async fn trail(State(state):State<AppState>,AxumPath((channel,kind,item)):AxumPath<(String,String,String)>)->Result<Json<serde_json::Value>,LocalError>{
    let token=access_token(&state).await?;
    let response=state.inner.http.get(format!("{}/v1/channels/{channel}/catalog-items/{kind}/{item}/trail",state.inner.server_url)).bearer_auth(token).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success(){return Err(remote_error(response).await);}
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}

pub(super) async fn create(State(state): State<AppState>, AxumPath(channel): AxumPath<String>, Json(body): Json<serde_json::Value>) -> Result<Json<serde_json::Value>, LocalError> {
    proxy_one(state.inner.http.post(format!("{}/v1/channels/{channel}/catalogs", state.inner.server_url)), &state, &body).await
}
pub(super) async fn rename(State(state): State<AppState>, AxumPath((channel, catalog)): AxumPath<(String, String)>, Json(body): Json<serde_json::Value>) -> Result<Json<serde_json::Value>, LocalError> {
    proxy_one(state.inner.http.patch(format!("{}/v1/channels/{channel}/catalogs/{catalog}", state.inner.server_url)), &state, &body).await
}
pub(super) async fn remove(State(state): State<AppState>, AxumPath((channel, catalog)): AxumPath<(String, String)>) -> Result<StatusCode, LocalError> {
    proxy_empty(state.inner.http.delete(format!("{}/v1/channels/{channel}/catalogs/{catalog}", state.inner.server_url)), &state, &serde_json::json!({})).await
}

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
