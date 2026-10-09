//! Account/asset-scoped immutable encoded cache. No reconstructed transcript is written.
use super::*;
use colab_local_core::session_chunks::Chunk;

#[derive(Serialize,Deserialize)]
pub(super) struct Manifest { pub chunks: Vec<Chunk> }

pub(super) async fn materialize(state: &AppState, share_id: &str) -> Result<String,LocalError> {
    let user=current_user_id(state).await?;
    let token=access_token_for_user(state,&user).await?;
    let response=state.inner.http.get(format!("{}/v1/sessions/{share_id}/segments?encoded=true",state.inner.server_url))
        .bearer_auth(&token).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() {return Err(remote_error(response).await)}
    let value=response.json::<Value>().await.map_err(LocalError::internal)?;
    let asset_id=assets::binding(state,share_id).await?.asset_id;
    let _guard=assets::publication_guard(state,"materialize_session",&format!("{user}:{asset_id}")).await;
    let snapshot=value["snapshot"]["id"].as_str().ok_or_else(||LocalError::internal("Session has no synchronized snapshot"))?;
    uuid::Uuid::parse_str(snapshot).map_err(LocalError::internal)?;
    let dir=state.inner.data_root.join("sessions").join(&user).join(&asset_id);
    fs::create_dir_all(&dir).map_err(LocalError::internal)?;
    let final_path=dir.join(format!("{snapshot}.chunks"));
    let indexed=!value["readIndex"].is_null();
    if !indexed && value["chunkProtocol"].as_u64().is_some_and(|version|version>=2)
        && value["segments"].as_array().and_then(|segments|segments.last()).is_some_and(|segment|segment["codec"]=="zstd") {
        return Err(LocalError {status:StatusCode::SERVICE_UNAVAILABLE,message:"Session preview index is preparing; synchronization continues independently. Retry shortly.".into()});
    }
    let mut chunks=Vec::new();
    for segment in value["segments"].as_array().ok_or_else(||LocalError::internal("Invalid Session manifest"))? {
        let id=segment["id"].as_str().ok_or_else(||LocalError::internal("Invalid Session segment"))?;
        uuid::Uuid::parse_str(id).map_err(LocalError::internal)?;
        let encoded_bytes=segment["byteSize"].as_u64().ok_or_else(||LocalError::internal("Invalid Session size"))?;
        let encoded_digest=segment["digest"].as_str().ok_or_else(||LocalError::internal("Invalid Session digest"))?.to_owned();
        let codec=segment["codec"].as_str().unwrap_or("identity").to_owned();
        let chunk=Chunk {id:id.into(),codec:codec.clone(),encoded_bytes,encoded_digest:encoded_digest.clone(),
            decoded_bytes:if codec=="identity" {encoded_bytes} else {segment["decodedByteSize"].as_u64().ok_or_else(||LocalError::internal("Invalid Session decoded size"))?},
            decoded_digest:if codec=="identity" {encoded_digest.clone()} else {segment["decodedDigest"].as_str().ok_or_else(||LocalError::internal("Invalid Session decoded digest"))?.into()}};
        chunk.validate().map_err(LocalError::internal)?;
        let path=dir.join(format!("{}.frame",chunk.encoded_digest));
        let key=path.to_string_lossy();
        let _frame_guard=assets::publication_guard(state,"session_frame",&key).await;
        if !indexed && !path.is_file() {
            let response=state.inner.http.get(format!("{}/v1/session-segments/{id}/content?encoded=true",state.inner.server_url)).bearer_auth(&token).send().await.map_err(LocalError::internal)?;
            if !response.status().is_success() {return Err(remote_error(response).await)}
            let temporary=path.with_extension("partial");
            if let Err(error)=download(response,&temporary,&chunk).await {let _=tokio::fs::remove_file(&temporary).await;return Err(error)}
            tokio::fs::rename(&temporary,&path).await.map_err(LocalError::internal)?;
        }
        chunks.push(chunk);
    }
    if indexed {
        let index=&value["readIndex"];
        if index["snapshotId"].as_str()!=Some(snapshot) {return Err(LocalError::internal("Session index snapshot mismatch"))}
        let chunk=Chunk {id:index["id"].as_str().ok_or_else(||LocalError::internal("Invalid Session index ID"))?.into(),codec:"zstd".into(),
            encoded_bytes:index["byteSize"].as_u64().ok_or_else(||LocalError::internal("Invalid Session index size"))?,encoded_digest:index["digest"].as_str().ok_or_else(||LocalError::internal("Invalid Session index digest"))?.into(),
            decoded_bytes:index["decodedByteSize"].as_u64().ok_or_else(||LocalError::internal("Invalid Session index size"))?,decoded_digest:index["decodedDigest"].as_str().ok_or_else(||LocalError::internal("Invalid Session index digest"))?.into()};
        chunk.validate().map_err(LocalError::internal)?;uuid::Uuid::parse_str(&chunk.id).map_err(LocalError::internal)?;
        let path=dir.join(format!("{}.index-frame",chunk.encoded_digest));
        if !path.is_file() {
            let response=state.inner.http.get(format!("{}/v1/session-read-indexes/{}/content",state.inner.server_url,chunk.id)).bearer_auth(&token).send().await.map_err(LocalError::internal)?;
            if !response.status().is_success() {return Err(remote_error(response).await)}
            let temporary=path.with_extension("partial");
            if let Err(error)=download(response,&temporary,&chunk).await {let _=tokio::fs::remove_file(&temporary).await;return Err(error)}
            tokio::fs::rename(temporary,&path).await.map_err(LocalError::internal)?;
        }
        let extent=chunks.iter().try_fold(0_u64,|offset,chunk|offset.checked_add(chunk.decoded_bytes)).ok_or_else(||LocalError::internal("Session manifest size overflow"))?;
        let output=final_path.clone();
        tokio::task::spawn_blocking(move ||->Result<(),LocalError> {
            let input=fs::File::open(path).map_err(LocalError::internal)?;let mut encoded=Vec::new();input.take(chunk.encoded_bytes+1).read_to_end(&mut encoded).map_err(LocalError::internal)?;
            let bytes=chunk.decode(&encoded).map_err(LocalError::internal)?;read_index::install(&output,&bytes,extent)
        }).await.map_err(LocalError::internal)??;
    }
    let manifest=serde_json::to_vec(&Manifest {chunks}).map_err(LocalError::internal)?;
    let temporary=final_path.with_extension("writing");
    tokio::fs::write(&temporary,manifest).await.map_err(LocalError::internal)?;
    tokio::fs::rename(&temporary,&final_path).await.map_err(LocalError::internal)?;
    state.inner.store.lock().await.execute("insert into session_materializations(share_id,user_id,snapshot_id,raw_path) values(?1,?2,?3,?4) on conflict(share_id,user_id) do update set snapshot_id=excluded.snapshot_id,raw_path=excluded.raw_path,updated_at=current_timestamp",rusqlite::params![asset_id,user,snapshot,final_path.to_string_lossy()]).map_err(LocalError::internal)?;
    read_index::prune_views(&dir,&final_path);
    Ok(final_path.to_string_lossy().into())
}

async fn download(mut response: reqwest::Response, path: &Path, chunk: &Chunk) -> Result<(),LocalError> {
    use tokio::io::AsyncWriteExt;
    let mut file=tokio::fs::File::create(path).await.map_err(LocalError::internal)?;
    let mut size=0_u64;let mut hash=Sha256::new();
    while let Some(bytes)=tokio::time::timeout(std::time::Duration::from_secs(60),response.chunk()).await.map_err(LocalError::internal)?.map_err(LocalError::internal)? {
        size=size.checked_add(bytes.len() as u64).filter(|size|*size<=chunk.encoded_bytes).ok_or_else(||LocalError::internal("Session chunk exceeds manifest"))?;
        hash.update(&bytes);file.write_all(&bytes).await.map_err(LocalError::internal)?;
    }
    if size!=chunk.encoded_bytes || hex::encode(hash.finalize())!=chunk.encoded_digest {return Err(LocalError::internal("Session chunk download mismatch"))}
    file.sync_all().await.map_err(LocalError::internal)?;
    Ok(())
}

pub(super) fn reader(path: &Path) -> Result<impl Read+Seek+use<>,LocalError> {
    let manifest: Manifest=serde_json::from_slice(&fs::read(path).map_err(LocalError::internal)?).map_err(LocalError::internal)?;
    let dir=path.parent().ok_or_else(||LocalError::internal("Invalid Session manifest path"))?.to_path_buf();
    colab_local_core::session_chunks::ChunkReader::new(manifest.chunks,move |chunk: &Chunk| {
        let input=fs::File::open(dir.join(format!("{}.frame",chunk.encoded_digest)))?;
        let mut bytes=Vec::new();input.take(chunk.encoded_bytes+1).read_to_end(&mut bytes)?;Ok(bytes)
    }).map_err(LocalError::internal)
}

pub(super) async fn ensure_page(state:&AppState,path:&Path,user:&str,outputs:bool,cursor:Option<&str>,snapshot:&str,limit:usize)->Result<(),LocalError> {
    if path.extension().is_none_or(|extension|extension!="chunks") {return Ok(())}
    let Some(ranges)=read_index::required_ranges(path,outputs,cursor,snapshot,limit)? else {return Ok(())};
    let manifest:Manifest=serde_json::from_slice(&fs::read(path).map_err(LocalError::internal)?).map_err(LocalError::internal)?;
    let dir=path.parent().ok_or_else(||LocalError::internal("Invalid Session cache path"))?;
    let token=access_token_for_user(state,user).await?;
    let mut offset=0_u64;
    for chunk in manifest.chunks {
        chunk.validate().map_err(LocalError::internal)?;
        let end=offset.checked_add(chunk.decoded_bytes).ok_or_else(||LocalError::internal("Session manifest size overflow"))?;
        let needed=ranges.iter().any(|(start,stop)|*start<end && *stop>offset);offset=end;
        let frame=dir.join(format!("{}.frame",chunk.encoded_digest));
        if !needed || frame.is_file() {continue}
        let key=frame.to_string_lossy();let _guard=assets::publication_guard(state,"session_frame",&key).await;
        if frame.is_file() {continue}
        uuid::Uuid::parse_str(&chunk.id).map_err(LocalError::internal)?;
        let response=state.inner.http.get(format!("{}/v1/session-segments/{}/content?encoded=true",state.inner.server_url,chunk.id)).bearer_auth(&token).send().await.map_err(LocalError::internal)?;
        if !response.status().is_success() {return Err(remote_error(response).await)}
        let temporary=frame.with_extension("partial");
        if let Err(error)=download(response,&temporary,&chunk).await {let _=tokio::fs::remove_file(&temporary).await;return Err(error)}
        tokio::fs::rename(temporary,frame).await.map_err(LocalError::internal)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize,Ordering};
    #[tokio::test]
    async fn receiver_downloads_only_page_frames_and_reuses_them_after_restart() {
        let root=std::env::temp_dir().join(format!("colab-page-http-{}",uuid::Uuid::new_v4()));fs::create_dir_all(&root).unwrap();
        let source=root.join("source.jsonl");
        let rows=[
            json!({"type":"event_msg","payload":{"type":"user_message","message":"old"}}),
            json!({"type":"response_item","payload":{"type":"function_call","call_id":"call","name":"bash","arguments":"{}"}}),
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"call","output":"ignored".repeat(20000)}}),
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"recent"}}),
            json!({"type":"event_msg","payload":{"type":"user_message","message":"recent"}}),
            json!({"type":"event_msg","payload":{"type":"agent_message","message":"answer"}}),
        ];
        let lines:Vec<_>=rows.iter().map(|row|format!("{row}\n")).collect();fs::write(&source,lines.concat()).unwrap();
        let bundle=read_index::bundle(&source,"codex-jsonl-v1").unwrap();
        let (index,encoded_index)=colab_local_core::session_chunks::encode(uuid::Uuid::new_v4().to_string(),&bundle).unwrap();
        let share=uuid::Uuid::new_v4().to_string();let asset=uuid::Uuid::new_v4().to_string();let snapshot=uuid::Uuid::new_v4().to_string();let user=uuid::Uuid::new_v4().to_string();
        let mut segments=Vec::new();let mut frames=HashMap::new();
        for line in &lines {
            let (chunk,encoded)=colab_local_core::session_chunks::encode(uuid::Uuid::new_v4().to_string(),line.as_bytes()).unwrap();
            segments.push(json!({"id":chunk.id,"byteSize":chunk.encoded_bytes,"digest":chunk.encoded_digest,"codec":"zstd","decodedByteSize":chunk.decoded_bytes,"decodedDigest":chunk.decoded_digest}));frames.insert(chunk.id,encoded);
        }
        let manifest=json!({"chunkProtocol":2,"snapshot":{"id":snapshot},"segments":segments,"readIndex":{"id":index.id,"snapshotId":snapshot,"digest":index.encoded_digest,"byteSize":index.encoded_bytes,"decodedDigest":index.decoded_digest,"decodedByteSize":index.decoded_bytes}});
        let binding=json!({"referenceId":share,"publicationId":share,"assetId":asset,"referenceCount":1,"currentSnapshotId":snapshot});
        let downloads=Arc::new(AtomicUsize::new(0));let count=downloads.clone();
        let app=Router::new()
            .route("/v1/sessions/{id}/segments",get(move ||{let value=manifest.clone();async move {Json(value)}}))
            .route("/v1/shares/{id}/asset",get(move ||{let value=binding.clone();async move {Json(value)}}))
            .route("/v1/session-read-indexes/{id}/content",get(move ||{let bytes=encoded_index.clone();async move {bytes}}))
            .route("/v1/session-segments/{id}/content",get(move |AxumPath(id):AxumPath<String>|{let bytes=frames[&id].clone();count.fetch_add(1,Ordering::SeqCst);async move {bytes}}));
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let url=format!("http://{}",listener.local_addr().unwrap());
        let server=tokio::spawn(async move {axum::serve(listener,app).await.unwrap()});
        let credentials=root.join("google.json");fs::write(&credentials,json!({"installed":{"client_id":"fixture","client_secret":"fixture","auth_uri":"unused","token_uri":"unused","redirect_uris":["http://localhost"]}}).to_string()).unwrap();
        let database=root.join("client.sqlite3");
        let state=AppState::load(&credentials,&database,"unused".into(),url.clone()).unwrap();
        let session=ColabSession {access_token:"fixture".into(),refresh_token:"fixture".into(),expires_in:3600,expires_at:i64::MAX,user:User {id:user.clone(),email:"fixture@example.invalid".into(),display_name:None,avatar_url:None}};
        {
            let store=state.inner.store.lock().await;
            store.execute("insert into accounts(user_id,email,session_json) values(?1,?2,?3)",rusqlite::params![user,session.user.email,serde_json::to_string(&session).unwrap()]).unwrap();
            store.execute("insert into local_settings(key,value) values('current_user_id',?1)",[&user]).unwrap();
        }
        *state.inner.session.lock().await=Some(session);
        let path=materialize(&state,&share).await.unwrap();assert_eq!(downloads.load(Ordering::SeqCst),0);
        ensure_page(&state,Path::new(&path),&user,false,None,&snapshot,1).await.unwrap();assert_eq!(downloads.load(Ordering::SeqCst),3);
        let recent=read_index::page(Path::new(&path),"codex-jsonl-v1",false,4000,None,&snapshot,1).unwrap().0;
        assert_eq!(recent,project_codex(&lines.concat(),false,4000)[1..]);
        drop(state);
        let state=AppState::load(&credentials,&database,"unused".into(),url).unwrap();
        ensure_page(&state,Path::new(&path),&user,false,None,&snapshot,1).await.unwrap();assert_eq!(downloads.load(Ordering::SeqCst),3);
        assert!(!Path::new(&path).with_extension("jsonl").exists());
        drop(state);server.abort();fs::remove_dir_all(root).unwrap();
    }
}
