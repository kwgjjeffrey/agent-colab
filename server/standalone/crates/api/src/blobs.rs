//! Bounded Blob-store streaming and orphan reconciliation.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::Duration,
};

use axum::{
    body::Body,
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

use crate::ApiError;

pub(crate) const REVISION_MAX_BYTES: u64 = 256 * 1024 * 1024;

pub(crate) fn path(root: &Path, key: &str) -> PathBuf {
    root.join(&key[..2]).join(key)
}

/// Streams an untrusted request into a temporary file and publishes it atomically only after the
/// entire bounded body arrives. This avoids both request-sized heap allocations and partial blobs.
pub(crate) async fn write_bounded(root: &Path, key: &str, body: Body) -> Result<u64, ApiError> {
    write_bounded_with_limit(root, key, body, REVISION_MAX_BYTES).await
}

async fn write_bounded_with_limit(
    root: &Path,
    key: &str,
    body: Body,
    limit: u64,
) -> Result<u64, ApiError> {
    let destination = path(root, key);
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| ApiError::internal("blob_write_failed"))?;
    }
    let temporary = destination.with_extension("uploading");
    let mut file = tokio::fs::File::create(&temporary)
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
    let mut total = 0_u64;
    let mut stream = body.into_data_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| ApiError::bad_request("blob_body_invalid"))?;
        total = total
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| ApiError::payload_too_large("blob_too_large"))?;
        if total > limit {
            let _ = tokio::fs::remove_file(&temporary).await;
            return Err(ApiError::payload_too_large("blob_too_large"));
        }
        file.write_all(&chunk)
            .await
            .map_err(|_| ApiError::internal("blob_write_failed"))?;
    }
    file.sync_all()
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
    drop(file);
    tokio::fs::rename(&temporary, &destination)
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bounded_stream_never_publishes_an_oversized_partial_blob() {
        let root =
            std::env::temp_dir().join(format!("agent-colab-blob-test-{}", uuid::Uuid::new_v4()));
        let key = "00112233445566778899aabbccddeeff";
        let error = write_bounded_with_limit(&root, key, Body::from("12345"), 4)
            .await
            .unwrap_err();
        assert_eq!(error.status, axum::http::StatusCode::PAYLOAD_TOO_LARGE);
        assert!(!path(&root, key).exists());
        let _ = tokio::fs::remove_dir_all(root).await;
    }
}

pub(crate) async fn response(
    root: &Path,
    key: &str,
    content_type: &'static str,
) -> Result<Response, ApiError> {
    let file = tokio::fs::File::open(path(root, key))
        .await
        .map_err(|_| ApiError::internal("blob_read_failed"))?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, content_type)],
        Body::from_stream(ReaderStream::new(file)),
    )
        .into_response())
}

pub(crate) fn spawn_orphan_gc(database: colab_server_persistence::Database, root: PathBuf) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(60 * 60));
        loop {
            tick.tick().await;
            if let Err(error) = collect_orphans(&database, &root).await {
                eprintln!("blob orphan GC failed: {error:#}");
            }
        }
    });
}

async fn collect_orphans(
    database: &colab_server_persistence::Database,
    root: &Path,
) -> anyhow::Result<()> {
    let referenced: HashSet<String> = database.referenced_blob_keys().await?.into_iter().collect();
    let cutoff = std::time::SystemTime::now() - Duration::from_secs(60 * 60);
    let mut prefixes = match tokio::fs::read_dir(root).await {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    while let Some(prefix) = prefixes.next_entry().await? {
        if !prefix.file_type().await?.is_dir() {
            continue;
        }
        let mut files = tokio::fs::read_dir(prefix.path()).await?;
        while let Some(entry) = files.next_entry().await? {
            if !entry.file_type().await?.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let key = name.strip_suffix(".uploading").unwrap_or(&name);
            if referenced.contains(key) {
                continue;
            }
            if entry
                .metadata()
                .await?
                .modified()
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                <= cutoff
            {
                tokio::fs::remove_file(entry.path()).await?;
            }
        }
    }
    Ok(())
}
