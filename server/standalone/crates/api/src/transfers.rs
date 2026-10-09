use std::{net::SocketAddr, time::Duration};

use axum::{
    Json, Router,
    body::Body,
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode, header},
    response::Response,
    routing::{get, post, put},
};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::io::StreamReader;
use uuid::Uuid;

use crate::{ApiError, AppState, blob_path};

const MIN_TTL_SECONDS: i64 = 5 * 60;
const MAX_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;
const MAX_ITEM_BYTES: i64 = 256 * 1024 * 1024;

pub(super) fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/transfers", post(create_transfer))
        .route("/v1/transfers/{transfer_id}/items", post(add_item))
        .route(
            "/v1/transfers/{transfer_id}/items/{item_id}/content",
            put(upload_item).get(download_item),
        )
        .route("/v1/transfers/{transfer_id}/finalize", post(finalize))
        .route(
            "/v1/transfers/{transfer_id}",
            get(get_manifest).delete(revoke),
        )
        .route(
            "/v1/transfers/{transfer_id}/manage",
            get(manage).patch(update_expiry),
        )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTransferRequest {
    expires_in_seconds: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedTransfer {
    id: Uuid,
    upload_token: String,
    read_token: String,
    revoke_token: String,
    expires_at: String,
}

async fn create_transfer(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Json(request): Json<CreateTransferRequest>,
) -> Result<(StatusCode, Json<CreatedTransfer>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.create-transfer", async {

    let ttl = request.expires_in_seconds.unwrap_or(24 * 60 * 60);
    if !(MIN_TTL_SECONDS..=MAX_TTL_SECONDS).contains(&ttl) {
        return Err(ApiError::bad_request("invalid_transfer_expiry"));
    }
    let upload_token = capability_token();
    let read_token = capability_token();
    let revoke_token = capability_token();
    let peer_ip = peer.ip().to_string();
    let (id, expires_at) = state
        .database
        .create_transfer(&peer_ip, ttl, &upload_token, &read_token, &revoke_token)
        .await
        .map_err(|error| match error {
            colab_server_persistence::CreateTransferError::RateLimited => {
                ApiError::too_many_requests("transfer_creation_rate_limited")
            }
            colab_server_persistence::CreateTransferError::Database(error) => {
                eprintln!("transfer creation failed: {error:#}");
                ApiError::internal("transfer_creation_failed")
            }
        })?;
    Ok((
        StatusCode::CREATED,
        Json(CreatedTransfer {
            id,
            upload_token,
            read_token,
            revoke_token,
            expires_at,
        }),
    ))

}).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddItemRequest {
    kind: String,
    name: String,
    source_adapter: String,
    #[serde(default)]
    metadata: serde_json::Value,
}

async fn add_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
    Json(request): Json<AddItemRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::TransferItem>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.add-item", async {

    let token = capability(&headers)?;
    let name = request.name.trim();
    if name.is_empty()
        || name.chars().count() > 120
        || !matches!(request.kind.as_str(), "files" | "session" | "skill")
        || request.source_adapter.is_empty()
        || request.source_adapter.chars().count() > 80
        || !request.metadata.is_object()
    {
        return Err(ApiError::bad_request("invalid_transfer_item"));
    }
    let item = state
        .database
        .add_transfer_item(
            transfer_id,
            token,
            &request.kind,
            name,
            &request.source_adapter,
            &request.metadata,
        )
        .await
        .map_err(|error| match error {
            colab_server_persistence::AddTransferItemError::DuplicateName => {
                ApiError::conflict("transfer_item_name_conflict")
            }
            colab_server_persistence::AddTransferItemError::Database(error) => {
                eprintln!("transfer item creation failed: {error:#}");
                ApiError::internal("transfer_item_creation_failed")
            }
        })?
        .ok_or_else(|| ApiError::forbidden("transfer_upload_forbidden"))?;
    Ok((StatusCode::CREATED, Json(item)))

}).await
}

async fn upload_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((transfer_id, item_id)): Path<(Uuid, Uuid)>,
    body: Body,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.upload-item", async {

    let token = capability(&headers)?;
    if !state
        .database
        .may_upload_transfer_item(transfer_id, item_id, token)
        .await
        .map_err(|_| ApiError::internal("transfer_item_lookup_failed"))?
    {
        return Err(ApiError::forbidden("transfer_upload_forbidden"));
    }

    let key = Uuid::new_v4().simple().to_string();
    let path = blob_path(&state.blob_root, &key);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| ApiError::internal("blob_write_failed"))?;
    }
    let temporary = path.with_extension("uploading");
    let mut output = tokio::fs::File::create(&temporary)
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
    let stream = body.into_data_stream().map_err(std::io::Error::other);
    let mut input = StreamReader::new(stream);
    let mut hasher = Sha256::new();
    let mut size = 0_i64;
    let mut buffer = vec![0_u8; 128 * 1024];
    loop {
        let read =
            match tokio::time::timeout(Duration::from_secs(60), input.read(&mut buffer)).await {
                Ok(Ok(read)) => read,
                Ok(Err(_)) | Err(_) => {
                    drop(output);
                    let _ = tokio::fs::remove_file(&temporary).await;
                    return Err(ApiError::bad_request("transfer_upload_interrupted"));
                }
            };
        if read == 0 {
            break;
        }
        size += read as i64;
        if size > MAX_ITEM_BYTES {
            let _ = tokio::fs::remove_file(&temporary).await;
            return Err(ApiError::bad_request("transfer_item_too_large"));
        }
        hasher.update(&buffer[..read]);
        output
            .write_all(&buffer[..read])
            .await
            .map_err(|_| ApiError::internal("blob_write_failed"))?;
    }
    if size == 0 {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(ApiError::bad_request("empty_transfer_item"));
    }
    output
        .sync_all()
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
    drop(output);
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
    let digest = hex::encode(hasher.finalize());
    state.blob_store.publish_staged(&key).await?;
    let accepted = state
        .database
        .commit_transfer_item(transfer_id, item_id, token, &key, &digest, size)
        .await
        .map_err(|_| ApiError::internal("transfer_item_commit_failed"))?;
    if !accepted {
        let _ = state.blob_store.delete(&key).await;
        return Err(ApiError::forbidden("transfer_upload_forbidden"));
    }
    Ok(StatusCode::NO_CONTENT)

}).await
}

async fn finalize(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.finalize", async {

    let token = capability(&headers)?;
    if state
        .database
        .finalize_transfer(transfer_id, token)
        .await
        .map_err(|_| ApiError::internal("transfer_finalize_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::conflict("transfer_not_ready"))
    }

}).await
}

async fn get_manifest(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
) -> Result<Json<colab_server_persistence::TransferManifest>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.get-manifest", async {

    let token = capability(&headers)?;
    let manifest = state
        .database
        .transfer_manifest(transfer_id, token)
        .await
        .map_err(|_| ApiError::internal("transfer_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("transfer_unavailable"))?;
    let reader_key = headers
        .get("x-colab-reader-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.len() <= 128 && !value.is_empty())
        .unwrap_or("unknown-reader");
    let user_id = if let Some(session_token) = headers
        .get("x-colab-session")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
    {
        state
            .database
            .authenticate(session_token)
            .await
            .ok()
            .flatten()
    } else {
        None
    };
    state
        .database
        .record_transfer_access(transfer_id, token, reader_key, user_id)
        .await
        .map_err(|_| ApiError::internal("transfer_access_record_failed"))?;
    Ok(Json(manifest))

}).await
}

async fn manage(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
) -> Result<Json<colab_server_persistence::ManagedTransfer>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.manage", async {

    let token = capability(&headers)?;
    state
        .database
        .managed_transfer(transfer_id, token)
        .await
        .map_err(|_| ApiError::internal("transfer_management_lookup_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("transfer_management_forbidden"))

}).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateExpiryRequest {
    expires_in_seconds: i64,
}

async fn update_expiry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
    Json(request): Json<UpdateExpiryRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.update-expiry", async {

    if !(MIN_TTL_SECONDS..=MAX_TTL_SECONDS).contains(&request.expires_in_seconds) {
        return Err(ApiError::bad_request("invalid_transfer_expiry"));
    }
    let token = capability(&headers)?;
    let expires_at = state
        .database
        .update_transfer_expiry(transfer_id, token, request.expires_in_seconds)
        .await
        .map_err(|_| ApiError::internal("transfer_expiry_update_failed"))?
        .ok_or_else(|| ApiError::forbidden("transfer_management_forbidden"))?;
    Ok(Json(serde_json::json!({"expiresAt":expires_at})))

}).await
}

async fn download_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((transfer_id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.download-item", async {

    let token = capability(&headers)?;
    let key = state
        .database
        .transfer_item_blob_key(transfer_id, item_id, token)
        .await
        .map_err(|_| ApiError::internal("transfer_item_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("transfer_unavailable"))?;
    let mut response = state.blob_store.response(&key, "application/octet-stream").await?;
    response.headers_mut().insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    Ok(response)

}).await
}

async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.revoke", async {

    let token = capability(&headers)?;
    if state
        .database
        .revoke_transfer(transfer_id, token)
        .await
        .map_err(|_| ApiError::internal("transfer_revoke_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("transfer_revoke_forbidden"))
    }

}).await
}

pub(super) fn spawn_expired_transfer_gc(
    database: colab_server_persistence::Database,
    store: crate::blob_store::BlobStore,
) {
    tokio::spawn(async move {
        loop {
            if let Err(error) = collect_expired(&database, &store).await {
                eprintln!("quick transfer garbage collection failed: {error:#}");
            }
            tokio::time::sleep(Duration::from_secs(15 * 60)).await;
        }
    });
}

async fn collect_expired(
    database: &colab_server_persistence::Database,
    store: &crate::blob_store::BlobStore,
) -> anyhow::Result<()> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.transfers.collect-expired", async {

    // Delete immutable blobs before metadata. A failed file deletion keeps the row for the next
    // pass; a missing file is already collected and is safe to forget.
    for transfer in database.expired_transfers(100).await? {
        let mut all_removed = true;
        for key in transfer.blob_keys {
            match store.delete(&key).await {
                Ok(()) => {}
                Err(error) => {
                    all_removed = false;
                    eprintln!("cannot remove expired transfer blob {key}: {error}");
                }
            }
        }
        if all_removed {
            database.delete_expired_transfer(transfer.id).await?;
        }
    }
    Ok(())

}).await
}

fn capability(headers: &HeaderMap) -> Result<&str, ApiError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| {
            value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
        })
        .ok_or_else(|| ApiError::forbidden("invalid_transfer_capability"))?;
    Ok(token)
}

fn capability_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}
