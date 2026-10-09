use super::*;
use axum::body::{Body, to_bytes};
use sha2::{Digest, Sha256};
const MAX: usize = 20 * 1024 * 1024;
pub(crate) fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/canvases/{canvas}/images", post(upload))
        .route("/v1/canvas-images/{id}", get(metadata).patch(interpret))
        .route("/v1/canvas-images/{id}/content", get(content))
}
async fn upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(canvas): Path<uuid::Uuid>,
    body: Body,
) -> Result<(StatusCode, Json<colab_server_persistence::CanvasImage>), ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .canvas_channel(user, canvas)
        .await
        .map_err(|_| ApiError::internal("canvas_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("canvas_access_forbidden"))?;
    let bytes = to_bytes(body, MAX)
        .await
        .map_err(|_| ApiError::payload_too_large("image_too_large"))?;
    let format = image::guess_format(&bytes).map_err(|_| ApiError::bad_request("invalid_image"))?;
    let mime = match format {
        image::ImageFormat::Png => "image/png",
        image::ImageFormat::Jpeg => "image/jpeg",
        image::ImageFormat::WebP => "image/webp",
        image::ImageFormat::Gif => "image/gif",
        _ => return Err(ApiError::bad_request("unsupported_image_format")),
    };
    // Decode with a memory bound before committing bytes; declared MIME alone is not validation.
    let validated = bytes.clone();
    tokio::task::spawn_blocking(move || {
        let mut reader = image::ImageReader::with_format(std::io::Cursor::new(validated), format);
        let mut limits = image::Limits::default();
        limits.max_alloc = Some(64 * 1024 * 1024);
        limits.max_image_width = Some(16384);
        limits.max_image_height = Some(16384);
        reader.limits(limits);
        reader.decode()
    })
    .await
    .map_err(|_| ApiError::internal("image_validation_failed"))?
    .map_err(|_| ApiError::bad_request("invalid_or_oversized_image"))?;
    let id = uuid::Uuid::new_v4();
    let key = uuid::Uuid::new_v4().simple().to_string();
    let digest = hex::encode(Sha256::digest(&bytes));
    crate::blobs::write_bounded(
        state.canvas_image_store.staging_root(),
        &key,
        Body::from(bytes.clone()),
    )
    .await?;
    state.canvas_image_store.publish_staged(&key).await?;
    match state
        .database
        .create_canvas_image(canvas, id, &key, mime, bytes.len() as i64, &digest)
        .await
    {
        Ok(row) => Ok((StatusCode::CREATED, Json(row))),
        Err(_) => {
            let _ = state.canvas_image_store.delete(&key).await;
            Err(ApiError::internal("image_registration_failed"))
        }
    }
}
// Image IDs are opaque capabilities. No per-image Channel membership check is added.
async fn metadata(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<colab_server_persistence::CanvasImage>, ApiError> {
    state
        .database
        .canvas_image(id)
        .await
        .map_err(|_| ApiError::internal("image_lookup_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::bad_request("image_not_found"))
}
async fn content(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Response, ApiError> {
    let (key, mime) = state
        .database
        .canvas_image_blob(id)
        .await
        .map_err(|_| ApiError::internal("image_lookup_failed"))?
        .ok_or_else(|| ApiError::bad_request("image_not_found"))?;
    let mime = match mime.as_str() {
        "image/png" => "image/png",
        "image/jpeg" => "image/jpeg",
        "image/webp" => "image/webp",
        "image/gif" => "image/gif",
        _ => return Err(ApiError::internal("invalid_image_type")),
    };
    let mut response = state.canvas_image_store.response(&key, mime).await?;
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        "private, max-age=3600".parse().unwrap(),
    );
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    Ok(response)
}
#[derive(Deserialize)]
struct Interpretation {
    image_interpretation: String,
}
async fn interpret(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<Interpretation>,
) -> Result<Json<colab_server_persistence::CanvasImage>, ApiError> {
    authenticated_user(&state, &headers).await?;
    if body.image_interpretation.len() > 32000 {
        return Err(ApiError::bad_request("interpretation_too_large"));
    }
    state
        .database
        .interpret_canvas_image(id, &body.image_interpretation)
        .await
        .map_err(|_| ApiError::internal("image_interpretation_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::bad_request("image_not_found"))
}
