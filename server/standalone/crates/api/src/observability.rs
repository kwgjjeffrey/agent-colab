//! Vendor-neutral, bounded OTLP relay. Vendor credentials exist only on the Server.
use super::*;
use axum::body::Bytes;
pub(super) async fn traces(State(state):State<AppState>,headers:HeaderMap,body:Bytes)->Result<impl IntoResponse,ApiError>{
 let _user=authenticated_user(&state,&headers).await?;
 let body=colab_observability::ingest::sanitize(&body).map_err(|_|ApiError::bad_request("invalid_telemetry"))?;
 let endpoint=std::env::var("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT").or_else(|_|std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").map(|s|format!("{}/v1/traces",s.trim_end_matches('/')))).map_err(|_|ApiError::unavailable("telemetry_disabled"))?;
 let mut request=state.http.post(endpoint).header("content-type","application/x-protobuf").timeout(std::time::Duration::from_secs(5)).body(body);
 if let Ok(headers)=std::env::var("OTEL_EXPORTER_OTLP_TRACES_HEADERS").or_else(|_|std::env::var("OTEL_EXPORTER_OTLP_HEADERS")){for header in headers.split(','){if let Some((k,v))=header.split_once('='){let value=percent_encoding::percent_decode_str(v.trim()).decode_utf8().map_err(|_|ApiError::unavailable("telemetry_configuration_invalid"))?;request=request.header(k.trim(),value.as_ref());}}}
 let response=request.send().await.map_err(|_|ApiError::unavailable("telemetry_unavailable"))?;
 if !response.status().is_success(){return Err(ApiError::unavailable("telemetry_rejected"))}
 // OTLP partial success must be propagated; never manufacture a success for rejected spans.
 let body=response.bytes().await.map_err(|_|ApiError::unavailable("telemetry_unavailable"))?;
 if body.len()>65536{return Err(ApiError::unavailable("telemetry_invalid_response"))}
 Ok(([ ("content-type","application/x-protobuf") ],body))
}
