//! Opaque contributor-produced read indexes, independent of transcript decoding.
use crate::*;
use colab_server_persistence::SessionReadIndex;

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub(super) struct UploadIndex {snapshot_id:uuid::Uuid,digest:String,decoded_digest:String,decoded_byte_size:u64}
pub(super) async fn upload(State(state):State<AppState>,headers:HeaderMap,Path(share):Path<uuid::Uuid>,Query(query):Query<UploadIndex>,body:Body)->Result<Json<SessionReadIndex>,ApiError> {
    let user=authenticated_user(&state,&headers).await?;
    session_upload::validate_codec_metadata("zstd",Some(query.decoded_byte_size),Some(&query.decoded_digest))?;
    if query.digest.len()!=64 || !query.digest.bytes().all(|b|b.is_ascii_hexdigit()) {return Err(ApiError::bad_request("invalid_read_index_digest"))}
    if state.database.asset_publication(user,share,"session").await.map_err(|_|ApiError::internal("read_index_owner_lookup_failed"))?.is_none() {return Err(ApiError::forbidden("session_index_owner_required"))}
    // Recover a lost ACK without uploading a second immutable copy.
    if let Some(index)=state.database.session_read_index(user,share).await.map_err(|_|ApiError::internal("read_index_lookup_failed"))? {
        if index.snapshot_id==query.snapshot_id && index.digest==query.digest && index.decoded_digest==query.decoded_digest && index.decoded_byte_size==query.decoded_byte_size as i64 {return Ok(Json(index))}
    }
    let key=uuid::Uuid::new_v4().simple().to_string();
    let size=session_upload::receive_zstd(&state.blob_root,&key,body,&query.digest).await?;
    let path=blobs::path(&state.blob_root,&key);let decoded_size=query.decoded_byte_size;let digest=query.decoded_digest.clone();
    if !matches!(tokio::task::spawn_blocking(move ||session_upload::verify_zstd(&path,decoded_size,&digest)).await,Ok(Ok(()))) {
        let _=state.blob_store.delete(&key).await;return Err(ApiError::bad_request("invalid_read_index_frame"))
    }
    state.blob_store.publish_staged(&key).await?;
    let index=SessionReadIndex {id:key.clone(),snapshot_id:query.snapshot_id,digest:query.digest,byte_size:size as i64,decoded_digest:query.decoded_digest,decoded_byte_size:decoded_size as i64};
    let committed=state.database.commit_session_read_index(user,share,&index).await;
    match committed {
        Ok(true)=>Ok(Json(index)),
        result=>{let _=state.blob_store.delete(&key).await;match result {Ok(false)=>Err(ApiError::conflict("session_index_snapshot_conflict")),Err(_)=>Err(ApiError::internal("read_index_commit_failed")),_=>unreachable!()}}
    }
}

pub(super) async fn download(State(state):State<AppState>,headers:HeaderMap,Path(id):Path<uuid::Uuid>)->Result<Response,ApiError> {
    let user=authenticated_user(&state,&headers).await?;
    let key=state.database.session_read_index_key(user,&id.simple().to_string()).await.map_err(|_|ApiError::internal("read_index_lookup_failed"))?.ok_or_else(||ApiError::forbidden("session_index_access_forbidden"))?;
    state.blob_store.response(&key,"application/octet-stream").await
}
