use std::{net::SocketAddr, time::Duration};

use axum::{
    Json, Router,
    body::Body,
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::io::{ReaderStream, StreamReader};
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
}

async fn upload_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((transfer_id, item_id)): Path<(Uuid, Uuid)>,
    body: Body,
) -> Result<StatusCode, ApiError> {
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
    let accepted = state
        .database
        .commit_transfer_item(transfer_id, item_id, token, &key, &digest, size)
        .await
        .map_err(|_| ApiError::internal("transfer_item_commit_failed"))?;
    if !accepted {
        let _ = tokio::fs::remove_file(path).await;
        return Err(ApiError::forbidden("transfer_upload_forbidden"));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn finalize(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
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
}

async fn get_manifest(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
) -> Result<Json<colab_server_persistence::TransferManifest>, ApiError> {
    let token = capability(&headers)?;
    state
        .database
        .transfer_manifest(transfer_id, token)
        .await
        .map_err(|_| ApiError::internal("transfer_lookup_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("transfer_unavailable"))
}

async fn download_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((transfer_id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    let token = capability(&headers)?;
    let key = state
        .database
        .transfer_item_blob_key(transfer_id, item_id, token)
        .await
        .map_err(|_| ApiError::internal("transfer_item_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("transfer_unavailable"))?;
    let file = tokio::fs::File::open(blob_path(&state.blob_root, &key))
        .await
        .map_err(|_| ApiError::internal("blob_read_failed"))?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        Body::from_stream(ReaderStream::new(file)),
    )
        .into_response())
}

async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
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
}

pub(super) fn spawn_expired_transfer_gc(
    database: colab_server_persistence::Database,
    blob_root: std::path::PathBuf,
) {
    tokio::spawn(async move {
        loop {
            if let Err(error) = collect_expired(&database, &blob_root).await {
                eprintln!("quick transfer garbage collection failed: {error:#}");
            }
            tokio::time::sleep(Duration::from_secs(15 * 60)).await;
        }
    });
}

async fn collect_expired(
    database: &colab_server_persistence::Database,
    blob_root: &std::path::Path,
) -> anyhow::Result<()> {
    // Delete immutable blobs before metadata. A failed file deletion keeps the row for the next
    // pass; a missing file is already collected and is safe to forget.
    for transfer in database.expired_transfers(100).await? {
        let mut all_removed = true;
        for key in transfer.blob_keys {
            match tokio::fs::remove_file(blob_path(blob_root, &key)).await {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
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
