//! Isolated HTTP acceptance; never uses a production database or authentication session.
use crate::*;
use sha2::{Digest,Sha256};

#[tokio::test]
#[ignore = "requires a disposable COLAB_SESSION_HTTP_TEST_DATABASE_URL"]
async fn compressed_http_roundtrip_legacy_reads_shared_references_and_index_retry()->anyhow::Result<()> {
    let database=Database::connect(&std::env::var("COLAB_SESSION_HTTP_TEST_DATABASE_URL")?,8).await?;
    let identity=uuid::Uuid::new_v4().to_string();
    let owner=database.create_google_session(&identity,&format!("{identity}@session-test.invalid"),None,None,None).await?;
    let identity=uuid::Uuid::new_v4().to_string();
    let outsider=database.create_google_session(&identity,&format!("{identity}@session-test.invalid"),None,None,None).await?;
    let org=database.create_organization(owner.user.id,"Session HTTP trial").await?;
    let a=database.create_channel(owner.user.id,org.id,"A",None).await?;
    let b=database.create_channel(owner.user.id,org.id,"B",None).await?;
    let request=colab_server_persistence::RegisterAsset {kind:"session".into(),name:"trial".into(),description:None,source_adapter:"codex-jsonl-v1".into(),source_key:hex::encode(Sha256::digest(identity.as_bytes())),existing_share_ids:vec![]};
    let first=database.register_asset(owner.user.id,a.id,&request).await?.unwrap();
    let second=database.register_asset(owner.user.id,b.id,&request).await?.unwrap();
    assert_eq!(first.asset_id,second.asset_id);
    let root=std::env::temp_dir().join(format!("colab-session-http-{}",uuid::Uuid::new_v4()));
    let (message_events,_)=tokio::sync::broadcast::channel(16);
    let (agent_status_events,_)=tokio::sync::broadcast::channel(16);
    let (agent_request_events,_)=tokio::sync::broadcast::channel(16);
    let (canvas_events,_)=tokio::sync::broadcast::channel(16);
    let state=AppState {database,http:reqwest::Client::new(),google_client_id:String::new(),external_auth:None,
        blob_root:root.clone(),blob_store:blob_store::BlobStore::disk(root.clone()),canvas_image_store:blob_store::BlobStore::disk(root.join("canvas")),message_events,agent_status_events,agent_request_events,canvas_events,runtime_presence:Arc::new(tokio::sync::RwLock::new(Default::default()))};
    let listener=TcpListener::bind("127.0.0.1:0").await?;let base=format!("http://{}",listener.local_addr()?);
    let server=tokio::spawn(async move {axum::serve(listener,router(state).into_make_service_with_connect_info::<SocketAddr>()).await});
    let http=reqwest::Client::new();let raw=b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"hello\"}}\n";
    let encoded=zstd::stream::encode_all(raw.as_slice(),3)?;
    let digest=hex::encode(Sha256::digest(&encoded));let decoded=hex::encode(Sha256::digest(raw));
    let query=[("sourceCursor",serde_json::json!({"byteOffset":raw.len()}).to_string()),("digest",digest.clone()),("codec","zstd".into()),("decodedByteSize",raw.len().to_string()),("decodedDigest",decoded)];
    let response=http.post(format!("{base}/v1/sessions/{}/segments",first.reference_id)).bearer_auth(&owner.access_token).query(&query).body(encoded.clone()).send().await?;
    assert_eq!(response.status(),StatusCode::CREATED);let result=response.json::<serde_json::Value>().await?;
    let snapshot=result["snapshot"]["id"].as_str().unwrap();
    let response=http.get(format!("{base}/v1/sessions/{}/segments?encoded=true",second.reference_id)).bearer_auth(&owner.access_token).send().await?;
    let manifest=response.json::<serde_json::Value>().await?;assert_eq!(manifest["snapshot"]["id"],snapshot);assert_eq!(manifest["segments"].as_array().unwrap().len(),1);assert_eq!(manifest["chunkProtocol"],2);
    let segment=manifest["segments"][0]["id"].as_str().unwrap();
    let legacy=http.get(format!("{base}/v1/sessions/{}/segments",second.reference_id)).bearer_auth(&owner.access_token).send().await?.json::<serde_json::Value>().await?;
    assert_eq!(legacy["segments"][0]["byteSize"],raw.len());
    assert_eq!(legacy["segments"][0]["digest"],hex::encode(Sha256::digest(raw)));
    for (suffix,expected) in [("",raw.as_slice()),("?encoded=true",encoded.as_slice())] {
        let response=http.get(format!("{base}/v1/session-segments/{segment}/content{suffix}")).bearer_auth(&owner.access_token).send().await?;
        assert_eq!(response.status(),StatusCode::OK);assert_eq!(response.bytes().await?.as_ref(),expected);
    }
    let index_bytes=b"opaque byte locator projection";let frame=zstd::stream::encode_all(index_bytes.as_slice(),3)?;
    let query=[("snapshotId",snapshot.to_owned()),("digest",hex::encode(Sha256::digest(&frame))),("decodedDigest",hex::encode(Sha256::digest(index_bytes))),("decodedByteSize",index_bytes.len().to_string())];
    let url=format!("{base}/v1/sessions/{}/read-index",first.reference_id);
    let mut id=String::new();
    for _ in 0..2 {
        let response=http.post(&url).bearer_auth(&owner.access_token).query(&query).body(frame.clone()).send().await?;
        assert_eq!(response.status(),StatusCode::OK);let index=response.json::<serde_json::Value>().await?;
        let next=index["id"].as_str().unwrap();if !id.is_empty() {assert_eq!(id,next)}id=next.into();
    }
    let response=http.get(format!("{base}/v1/session-read-indexes/{id}/content")).bearer_auth(&owner.access_token).send().await?;
    assert_eq!(response.bytes().await?.as_ref(),frame.as_slice());
    let response=http.post(&url).bearer_auth(&outsider.access_token).query(&query).body(frame).send().await?;
    assert_eq!(response.status(),StatusCode::FORBIDDEN);
    let response=http.get(format!("{base}/v1/session-segments/{segment}/content")).bearer_auth(&outsider.access_token).send().await?;
    assert_eq!(response.status(),StatusCode::FORBIDDEN);
    // A legacy writer may append raw bytes to a compressed chain. A later
    // protocol-2 writer can resume without rewriting either historical segment.
    let legacy_query=[("parentSnapshotId",snapshot.to_owned()),("sourceCursor",serde_json::json!({"byteOffset":raw.len()*2}).to_string()),("digest",hex::encode(Sha256::digest(raw)))];
    let response=http.post(format!("{base}/v1/sessions/{}/segments",second.reference_id)).bearer_auth(&owner.access_token).query(&legacy_query).body(raw.to_vec()).send().await?;
    assert_eq!(response.status(),StatusCode::CREATED);
    let next=response.json::<serde_json::Value>().await?;
    let query=[("parentSnapshotId",next["snapshot"]["id"].as_str().unwrap().to_owned()),("sourceCursor",serde_json::json!({"byteOffset":raw.len()*3}).to_string()),("digest",digest),("codec","zstd".into()),("decodedByteSize",raw.len().to_string()),("decodedDigest",hex::encode(Sha256::digest(raw)))];
    let response=http.post(format!("{base}/v1/sessions/{}/segments",first.reference_id)).bearer_auth(&owner.access_token).query(&query).body(encoded.clone()).send().await?;
    assert_eq!(response.status(),StatusCode::CREATED);
    for encoded_mode in [false,true] {
        let response=http.get(format!("{base}/v1/sessions/{}/segments?encoded={encoded_mode}",second.reference_id)).bearer_auth(&owner.access_token).send().await?;
        let chain=response.json::<serde_json::Value>().await?;
        let segments=chain["segments"].as_array().unwrap();assert_eq!(segments.len(),3);
        assert_eq!(segments[0]["codec"],"zstd");assert_eq!(segments[1]["codec"],"identity");assert_eq!(segments[2]["codec"],"zstd");
        for segment in segments {
            let id=segment["id"].as_str().unwrap();
            let bytes=http.get(format!("{base}/v1/session-segments/{id}/content?encoded={encoded_mode}")).bearer_auth(&owner.access_token).send().await?.bytes().await?;
            assert_eq!(bytes.len() as u64,segment["byteSize"].as_u64().unwrap());
            assert_eq!(hex::encode(Sha256::digest(&bytes)),segment["digest"].as_str().unwrap());
            if !encoded_mode || segment["codec"]=="identity" {assert_eq!(bytes.as_ref(),raw)}
        }
    }
    server.abort();tokio::fs::remove_dir_all(root).await?;Ok(())
}
