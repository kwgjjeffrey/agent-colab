//! Deployment storage boundary. Database keys and authorization never depend on the backend.
use crate::ApiError;
use axum::{
    body::Body,
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use object_store::{ObjectStore, ObjectStoreExt, aws::AmazonS3Builder, buffered::BufWriter};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::io::AsyncWriteExt;

#[derive(Clone)]
pub(crate) struct BlobStore {
    root: PathBuf,
    remote: Option<Arc<dyn ObjectStore>>,
    prefix: object_store::path::Path,
}

impl BlobStore {
    pub(crate) fn from_env(root: PathBuf) -> anyhow::Result<Self> {
        let backend = std::env::var("COLAB_BLOB_BACKEND").unwrap_or_else(|_| "disk".into());
        match backend.as_str() {
            "disk" => Ok(Self::disk(root)),
            "s3" => {
                let bucket = std::env::var("COLAB_BLOB_S3_BUCKET")?;
                let prefix = std::env::var("COLAB_BLOB_S3_PREFIX")?;
                // Require an isolated managed namespace: GC must never scan an entire shared bucket.
                anyhow::ensure!(
                    !prefix.is_empty()
                        && !prefix.starts_with('/')
                        && !prefix.ends_with('/')
                        && prefix
                            .split('/')
                            .all(|s| !s.is_empty() && s != "." && s != ".."),
                    "invalid Blob S3 prefix"
                );
                let remote = AmazonS3Builder::from_env()
                    .with_bucket_name(bucket)
                    .build()?;
                Ok(Self {
                    root,
                    remote: Some(Arc::new(remote)),
                    prefix: object_store::path::Path::parse(prefix)?,
                })
            }
            _ => anyhow::bail!("COLAB_BLOB_BACKEND must be disk or s3"),
        }
    }

    /// Canvas attachments have a separate namespace so enabling R2 never relocates
    /// existing Files and Session bytes or changes their deployment backend.
    pub(crate) fn canvas_images_from_env(root: PathBuf) -> anyhow::Result<Self> {
        let Ok(bucket) = std::env::var("COLAB_CANVAS_IMAGE_S3_BUCKET") else { return Ok(Self::disk(root)); };
        let prefix = std::env::var("COLAB_CANVAS_IMAGE_S3_PREFIX")?;
        anyhow::ensure!(!prefix.is_empty() && !prefix.starts_with('/') && !prefix.ends_with('/') && prefix.split('/').all(|p| !p.is_empty() && p != "." && p != ".."), "invalid Canvas image prefix");
        let remote = AmazonS3Builder::from_env().with_bucket_name(bucket).build()?;
        Ok(Self { root, remote: Some(Arc::new(remote)), prefix: object_store::path::Path::parse(prefix)? })
    }

    pub(crate) fn disk(root: PathBuf) -> Self {
        Self {
            root,
            remote: None,
            prefix: object_store::path::Path::default(),
        }
    }

    fn location(&self, key: &str) -> Result<object_store::path::Path, ApiError> {
        if key.len() != 32 || !key.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(ApiError::internal("invalid_blob_key"));
        }
        Ok(self.prefix.clone().join(&key[..2]).join(key))
    }

    /// Only validated, fsynced staging files enter the final store. Multipart implementation
    /// is supplied by object_store; its buffer and concurrent parts remain explicitly bounded.
    pub(crate) async fn publish_staged(&self, key: &str) -> Result<(), ApiError> {
        let location = self.location(key)?;
        let Some(remote) = &self.remote else {
            return Ok(());
        };
        let path = crate::blobs::path(&self.root, key);
        let mut source = tokio::fs::File::open(&path)
            .await
            .map_err(|_| ApiError::internal("blob_read_failed"))?;
        let mut writer = BufWriter::with_capacity(remote.clone(), location, 8 * 1024 * 1024)
            .with_max_concurrency(2);
        if tokio::io::copy(&mut source, &mut writer).await.is_err() {
            let _ = writer.abort().await;
            return Err(ApiError::internal("blob_write_failed"));
        }
        writer
            .shutdown()
            .await
            .map_err(|_| ApiError::internal("blob_write_failed"))?;
        // The immutable object is now durable. Local staging is disposable, not a second store.
        let _ = tokio::fs::remove_file(path).await;
        Ok(())
    }

    pub(crate) async fn response(
        &self,
        key: &str,
        content_type: &'static str,
    ) -> Result<Response, ApiError> {
        let location = self.location(key)?;
        let Some(remote) = &self.remote else {
            return crate::blobs::response(&self.root, key, content_type).await;
        };
        let object = remote
            .get(&location)
            .await
            .map_err(|_| ApiError::internal("blob_read_failed"))?;
        Ok((
            [(axum::http::header::CONTENT_TYPE, content_type)],
            Body::from_stream(object.into_stream()),
        )
            .into_response())
    }

    pub(crate) async fn delete(&self, key: &str) -> anyhow::Result<()> {
        let location = self
            .location(key)
            .map_err(|_| anyhow::anyhow!("invalid Blob key"))?;
        if let Some(remote) = &self.remote {
            match remote.delete(&location).await {
                Ok(_) | Err(object_store::Error::NotFound { .. }) => {}
                Err(e) => return Err(e.into()),
            }
        }
        match tokio::fs::remove_file(crate::blobs::path(&self.root, key)).await {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    pub(crate) async fn collect_remote_orphans(
        &self,
        referenced: &std::collections::HashSet<String>,
    ) -> anyhow::Result<()> {
        // Grace period covers uploads between durable storage and the database CAS.
        let cutoff = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64
            - 3600;
        self.collect_remote_orphans_before(referenced, cutoff).await
    }

    async fn collect_remote_orphans_before(
        &self,
        referenced: &std::collections::HashSet<String>,
        cutoff: i64,
    ) -> anyhow::Result<()> {
        let Some(remote) = &self.remote else {
            return Ok(());
        };
        let mut objects = remote.list(Some(&self.prefix));
        while let Some(object) = objects.next().await {
            let object = object?;
            let key = object.location.filename().unwrap_or_default();
            if referenced.contains(key)
                || self.location(key).ok().as_ref() != Some(&object.location)
            {
                continue;
            }
            if object.last_modified.timestamp() <= cutoff {
                remote.delete(&object.location).await?;
            }
        }
        Ok(())
    }

    pub(crate) fn staging_root(&self) -> &Path {
        &self.root
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn disk_preserves_existing_layout_and_idempotent_deletion() {
        let root = std::env::temp_dir().join(format!("colab-store-{}", uuid::Uuid::new_v4()));
        let store = BlobStore::disk(root.clone());
        let key = "00112233445566778899aabbccddeeff";
        crate::blobs::write_bounded(&root, key, Body::from("payload"))
            .await
            .unwrap();
        store.publish_staged(key).await.unwrap();
        let bytes = axum::body::to_bytes(
            store
                .response(key, "application/octet-stream")
                .await
                .unwrap()
                .into_body(),
            100,
        )
        .await
        .unwrap();
        assert_eq!(&bytes[..], b"payload");
        store.delete(key).await.unwrap();
        store.delete(key).await.unwrap();
        assert!(store.response("../outside", "text/plain").await.is_err());
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn remote_port_streams_staging_and_supports_idempotent_deletion() {
        let root = std::env::temp_dir().join(format!("colab-store-{}", uuid::Uuid::new_v4()));
        let remote = Arc::new(object_store::memory::InMemory::new());
        let store = BlobStore {
            root: root.clone(),
            remote: Some(remote.clone()),
            prefix: "managed".into(),
        };
        let key = "00112233445566778899aabbccddeeff";
        let payload = vec![42; 10 * 1024 * 1024];
        crate::blobs::write_bounded(&root, key, Body::from(payload.clone()))
            .await
            .unwrap();
        store.publish_staged(key).await.unwrap();
        assert!(!crate::blobs::path(&root, key).exists());
        let bytes = axum::body::to_bytes(
            store
                .response(key, "application/octet-stream")
                .await
                .unwrap()
                .into_body(),
            11 * 1024 * 1024,
        )
        .await
        .unwrap();
        assert_eq!(&bytes[..], payload);
        store.delete(key).await.unwrap();
        store.delete(key).await.unwrap();
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn gc_preserves_references_foreign_paths_and_inflight_objects() {
        let remote = Arc::new(object_store::memory::InMemory::new());
        let store = BlobStore {
            root: PathBuf::new(),
            remote: Some(remote.clone()),
            prefix: "managed".into(),
        };
        let keep = "00112233445566778899aabbccddeeff";
        let orphan = "11112233445566778899aabbccddeeff";
        let foreign: object_store::path::Path =
            "managed/not-owned/11112233445566778899aabbccddeeff".into();
        let outside: object_store::path::Path = "other/11/11112233445566778899aabbccddeeff".into();
        for path in [
            store.location(keep).unwrap(),
            store.location(orphan).unwrap(),
            foreign.clone(),
            outside.clone(),
        ] {
            remote
                .put(&path, object_store::PutPayload::from_static(b"data"))
                .await
                .unwrap();
        }
        let references = std::collections::HashSet::from([keep.to_owned()]);
        store.collect_remote_orphans(&references).await.unwrap();
        assert!(remote.head(&store.location(orphan).unwrap()).await.is_ok());
        store
            .collect_remote_orphans_before(&references, i64::MAX)
            .await
            .unwrap();
        assert!(remote.head(&store.location(orphan).unwrap()).await.is_err());
        for path in [store.location(keep).unwrap(), foreign, outside] {
            assert!(remote.head(&path).await.is_ok());
        }
    }
}
