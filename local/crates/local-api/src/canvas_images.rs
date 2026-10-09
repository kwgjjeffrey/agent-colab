use super::*;
use axum::body::{Body, to_bytes};
const MAX: usize = 20 * 1024 * 1024;
pub(super) async fn upload(
    State(state): State<AppState>,
    AxumPath(canvas): AxumPath<String>,
    body: Body,
) -> Result<Response, LocalError> {
    let bytes = to_bytes(body, MAX)
        .await
        .map_err(|_| LocalError::bad_request("Image must be at most 20 MiB"))?;
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/canvases/{canvas}/images",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .header("content-type", "application/octet-stream")
        .body(bytes)
        .send()
        .await
        .map_err(LocalError::internal)?;
    forward(response).await
}
pub(super) async fn metadata(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Response, LocalError> {
    forward(
        state
            .inner
            .http
            .get(format!("{}/v1/canvas-images/{id}", state.inner.server_url))
            .send()
            .await
            .map_err(LocalError::internal)?,
    )
    .await
}
pub(super) async fn content(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Response, LocalError> {
    forward(
        state
            .inner
            .http
            .get(format!(
                "{}/v1/canvas-images/{id}/content",
                state.inner.server_url
            ))
            .send()
            .await
            .map_err(LocalError::internal)?,
    )
    .await
}
pub(super) async fn interpret(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Response, LocalError> {
    let token = access_token(&state).await?;
    forward(
        state
            .inner
            .http
            .patch(format!("{}/v1/canvas-images/{id}", state.inner.server_url))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(LocalError::internal)?,
    )
    .await
}
async fn forward(response: reqwest::Response) -> Result<Response, LocalError> {
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let status = response.status();
    let headers = response.headers().clone();
    let mut result = Response::new(Body::from_stream(response.bytes_stream()));
    *result.status_mut() = status;
    for name in [
        header::CONTENT_TYPE,
        header::CACHE_CONTROL,
        header::CONTENT_LENGTH,
    ] {
        if let Some(value) = headers.get(&name) {
            result.headers_mut().insert(name, value.clone());
        }
    }
    Ok(result)
}
