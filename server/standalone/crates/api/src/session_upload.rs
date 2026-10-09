//! Session bytes are not readable until the bounded upload and digest both commit.
use axum::body::Body;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::{path::Path, time::Duration};
use tokio::io::AsyncWriteExt;
use crate::ApiError;

pub(crate) fn validate_codec_metadata(codec: &str, size: Option<u64>, digest: Option<&str>) -> Result<(),ApiError> {
    let valid = match codec {
        "identity" => size.is_none() && digest.is_none(),
        "zstd" => size.is_some_and(|size|size>0 && size<=40*1024*1024)
            && digest.is_some_and(|digest|digest.len()==64 && digest.bytes().all(|b|b.is_ascii_digit() || (b'a'..=b'f').contains(&b))),
        _ => false,
    };
    if valid {Ok(())} else {Err(ApiError::bad_request("invalid_session_codec_metadata"))}
}

pub(crate) fn verify_zstd(path: &Path, size: u64, expected: &str) -> std::io::Result<()> {
    use std::io::Read;
    let file = std::fs::File::open(path)?;
    let mut decoder = zstd::stream::read::Decoder::new(file)?;
    decoder.window_log_max(26)?;
    let mut limited = decoder.single_frame().take(size+1);
    let mut hash = Sha256::new();let mut total=0_u64;let mut buffer=[0_u8;65536];
    loop { let read=limited.read(&mut buffer)?;if read==0 {break} total+=read as u64;hash.update(&buffer[..read]); }
    if total!=size || hex::encode(hash.finalize())!=expected {return Err(std::io::Error::new(std::io::ErrorKind::InvalidData,"decoded chunk mismatch"))}
    let mut input=limited.into_inner().finish();
    if !std::io::BufRead::fill_buf(&mut input)?.is_empty() {return Err(std::io::Error::new(std::io::ErrorKind::InvalidData,"trailing Session frames"))} Ok(())
}

pub(crate) async fn receive(root: &Path, key: &str, body: Body, expected: &str) -> Result<u64, ApiError> {
    receive_with_limits(root, key, body, expected, crate::blobs::REVISION_MAX_BYTES, Duration::from_secs(60)).await
}

pub(crate) async fn receive_zstd(root: &Path, key: &str, body: Body, expected: &str) -> Result<u64, ApiError> {
    receive_with_limits(root, key, body, expected, 41*1024*1024, Duration::from_secs(60)).await
}

async fn receive_with_limits(root: &Path, key: &str, body: Body, expected: &str, limit: u64, idle: Duration) -> Result<u64, ApiError> {
    let destination = crate::blobs::path(root, key);
    if let Some(parent) = destination.parent() { tokio::fs::create_dir_all(parent).await.map_err(|_| ApiError::internal("blob_write_failed"))?; }
    let temporary = destination.with_extension("uploading");
    let result = async {
        let mut output = tokio::fs::File::create(&temporary).await.map_err(|_| ApiError::internal("blob_write_failed"))?;
        let mut stream = body.into_data_stream();
        let mut size = 0_u64;
        let mut digest = Sha256::new();
        loop {
            let next = tokio::time::timeout(idle, stream.next()).await
                .map_err(|_| ApiError::bad_request("session_upload_idle_timeout"))?;
            let Some(chunk) = next else { break; };
            let bytes = chunk.map_err(|_| ApiError::bad_request("session_upload_interrupted"))?;
            size = size.checked_add(bytes.len() as u64).filter(|size| *size <= limit)
                .ok_or_else(|| ApiError::payload_too_large("session_segment_too_large"))?;
            digest.update(&bytes);
            output.write_all(&bytes).await.map_err(|_| ApiError::internal("blob_write_failed"))?;
        }
        if size == 0 || hex::encode(digest.finalize()) != expected { return Err(ApiError::bad_request("session_segment_digest_mismatch")); }
        output.sync_all().await.map_err(|_| ApiError::internal("blob_write_failed"))?;
        drop(output);
        tokio::fs::rename(&temporary, &destination).await.map_err(|_| ApiError::internal("blob_write_failed"))?;
        Ok(size)
    }.await;
    if result.is_err() { let _ = tokio::fs::remove_file(&temporary).await; }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Bytes;
    fn root() -> std::path::PathBuf { std::env::temp_dir().join(format!("colab-session-upload-{}",uuid::Uuid::new_v4())) }
    const KEY: &str = "00112233445566778899aabbccddeeff";
    #[tokio::test]
    async fn verifies_one_bounded_zstd_frame_and_legacy_metadata() {
        let root=root();tokio::fs::create_dir_all(&root).await.unwrap();
        let path=root.join("frame");let raw="中文🦀\n".repeat(1000);
        let encoded=zstd::stream::encode_all(raw.as_bytes(),3).unwrap();
        let digest=hex::encode(Sha256::digest(raw.as_bytes()));
        tokio::fs::write(&path,&encoded).await.unwrap();
        assert!(validate_codec_metadata("identity",None,None).is_ok());
        assert!(validate_codec_metadata("zstd",Some(raw.len() as u64),Some(&digest)).is_ok());
        assert!(validate_codec_metadata("zstd",Some(0),Some(&digest)).is_err());
        assert!(validate_codec_metadata("identity",Some(1),Some(&digest)).is_err());
        assert!(verify_zstd(&path,raw.len() as u64,&digest).is_ok());
        assert!(verify_zstd(&path,1,&digest).is_err());
        assert!(verify_zstd(&path,raw.len() as u64,&"0".repeat(64)).is_err());
        let mut joined=encoded.clone();joined.extend_from_slice(&encoded);
        tokio::fs::write(&path,&joined).await.unwrap();assert!(verify_zstd(&path,raw.len() as u64,&digest).is_err());
        tokio::fs::write(&path,&encoded[..encoded.len()-1]).await.unwrap();assert!(verify_zstd(&path,raw.len() as u64,&digest).is_err());
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn verifies_streamed_bytes_before_publication() {
        let root = root();
        let body = Body::from_stream(futures_util::stream::iter([Ok::<_,std::io::Error>(Bytes::from_static(b"hello")),Ok(Bytes::from_static(b" world"))]));
        let size = receive(&root,KEY,body,&hex::encode(Sha256::digest(b"hello world"))).await.unwrap();
        assert_eq!(size,11);
        assert_eq!(tokio::fs::read(crate::blobs::path(&root,KEY)).await.unwrap(),b"hello world");
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn invalid_digest_size_and_interrupted_stream_never_publish() {
        let root = root();
        assert!(receive(&root,KEY,Body::from("hello"),&"0".repeat(64)).await.is_err());
        assert!(receive_with_limits(&root,KEY,Body::from("hello"),&hex::encode(Sha256::digest(b"hello")),4,Duration::from_secs(60)).await.is_err());
        let body = Body::from_stream(futures_util::stream::iter([Ok(Bytes::from_static(b"hello")),Err(std::io::Error::other("interrupted"))]));
        assert!(receive(&root,KEY,body,&hex::encode(Sha256::digest(b"hello"))).await.is_err());
        assert!(!crate::blobs::path(&root,KEY).exists());
        assert!(!crate::blobs::path(&root,KEY).with_extension("uploading").exists());
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn stalled_stream_is_bounded_and_cleans_partial_file() {
        let root = root();
        let body = Body::from_stream(futures_util::stream::pending::<Result<Bytes,std::io::Error>>());
        assert!(receive_with_limits(&root,KEY,body,&"0".repeat(64),100,Duration::from_millis(5)).await.is_err());
        assert!(!crate::blobs::path(&root,KEY).with_extension("uploading").exists());
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
