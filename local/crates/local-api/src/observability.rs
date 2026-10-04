//! Local-only OTLP intake with a bounded best-effort queue. A successful intake means
//! accepted into this queue, not delivered to Honeycomb. Delivery counters expose the distinction.
use super::*;
use axum::body::Bytes;
use std::sync::{OnceLock,atomic::{AtomicU64,Ordering}};
static QUEUE:OnceLock<tokio::sync::mpsc::Sender<Vec<u8>>>=OnceLock::new();
static ACCEPTED:AtomicU64=AtomicU64::new(0);
static DELIVERED:AtomicU64=AtomicU64::new(0);
static DROPPED:AtomicU64=AtomicU64::new(0);
fn queue(state:AppState)->&'static tokio::sync::mpsc::Sender<Vec<u8>>{
 QUEUE.get_or_init(||{
   let (tx,mut rx)=tokio::sync::mpsc::channel::<Vec<u8>>(16);
   tokio::spawn(async move{
     let client=reqwest::Client::new();
     while let Some(body)=rx.recv().await{
       let mut delivered=false;
       for attempt in 0..3 {
         // Resolve credentials inside Core; a GUI/Skill producer never chooses the destination.
         let Ok(token)=access_token(&state).await else {break};
         let result=client.post(format!("{}/v1/observability/traces",state.inner.server_url)).bearer_auth(token).header("content-type","application/x-protobuf").timeout(std::time::Duration::from_secs(5)).body(body.clone()).send().await;
         if let Ok(response)=result{
           if response.status().is_success(){
             if let Ok(bytes)=response.bytes().await{
               // OTLP empty response is full acceptance. Partial success is not counted as full delivery.
               if colab_observability::ingest::fully_accepted(&bytes){delivered=true;break}
             }
           }else if response.status().is_client_error(){break}
         }
         tokio::time::sleep(std::time::Duration::from_millis(200*(1<<attempt))).await;
       }
       if delivered{DELIVERED.fetch_add(1,Ordering::Relaxed);}else{DROPPED.fetch_add(1,Ordering::Relaxed);}
     }
   });
   tx
 })
}
pub(super) async fn traces(State(state):State<AppState>,body:Bytes)->Result<impl IntoResponse,LocalError>{
 if !std::env::var("COLAB_TRACING_ENABLED").is_ok_and(|v|v=="1"){return Err(LocalError::bad_request("Tracing disabled"))}
 let body=colab_observability::ingest::sanitize(&body).map_err(LocalError::bad_request)?;
 queue(state).try_send(body).map_err(|_|LocalError::bad_request("Telemetry queue full"))?;
 ACCEPTED.fetch_add(1,Ordering::Relaxed);
 Ok(([ ("content-type","application/x-protobuf") ],Vec::<u8>::new()))
}
pub(super) async fn config()->Json<serde_json::Value>{Json(serde_json::json!({"enabled":std::env::var("COLAB_TRACING_ENABLED").is_ok_and(|v|v=="1"),"protocol":"http/protobuf","delivery":{"accepted":ACCEPTED.load(Ordering::Relaxed),"delivered":DELIVERED.load(Ordering::Relaxed),"dropped":DROPPED.load(Ordering::Relaxed)}}))}
