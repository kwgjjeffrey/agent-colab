//! Black-box two-process boundary fixture. It uses the production middleware/client,
//! and exercises the installed Python command without touching accounts or product data.
use axum::{
    Router,
    body::Bytes,
    middleware,
    response::IntoResponse,
    routing::{get, post},
};
use std::{env, net::SocketAddr};
#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let mode = env::var("PROBE_ROLE")?;
    let _guard = colab_observability::init(
        if mode == "core" {
            "colab-local-core"
        } else {
            "colab-server"
        },
        "boundary-validation",
    );
    let mut router = Router::new()
        .route(
            "/v1/observability/config",
            get(|| async { axum::Json(serde_json::json!({"enabled":true})) }),
        )
        .route(
            "/v1/observability/clock",
            get(colab_observability::clock_reply),
        )
        .route(
            "/v1/observability/traces",
            post(|body: Bytes| async move {
                let body = colab_observability::ingest::sanitize(&body).unwrap();
                tokio::spawn(async move {
                    let response = reqwest::Client::new()
                        .post(format!(
                            "{}/v1/traces",
                            env::var("OTEL_EXPORTER_OTLP_ENDPOINT").unwrap()
                        ))
                        .headers({
                            let mut headers = reqwest::header::HeaderMap::new();
                            headers.insert(reqwest::header::HeaderName::from_bytes(env::var("PROBE_AUTH_HEADER").unwrap_or("x-honeycomb-team".into()).as_bytes()).unwrap(), env::var("PROBE_AUTH_VALUE").or_else(|_| env::var("PROBE_INGEST_KEY")).unwrap().parse().unwrap());
                            headers
                        })
                        .header("content-type", "application/x-protobuf")
                        .body(body)
                        .send()
                        .await
                        .unwrap();
                    let status = response.status();
                    assert!(status.is_success(), "fixture upstream rejected OTLP");
                });
                (
                    [("content-type", "application/x-protobuf")],
                    Vec::<u8>::new(),
                )
                    .into_response()
            }),
        );
    if mode == "core" {
        colab_observability::calibrate(&format!(
            "{}/v1/observability/clock",
            env::var("PROBE_SERVER")?
        ))
        .await;
        router = router.route(
            "/v1/channels",
            get(|| async {
                let r = colab_observability::client()
                    .get(format!("{}/v1/channels", env::var("PROBE_SERVER").unwrap()))
                    .send()
                    .await
                    .unwrap();
                let status = r.status();
                (
                    status,
                    [("content-type", "application/json")],
                    r.bytes().await.unwrap(),
                )
                    .into_response()
            }),
        );
    } else {
        router = router.route(
            "/v1/channels",
            get(|| async { axum::Json(Vec::<serde_json::Value>::new()) }),
        );
    }
    router = router.layer(middleware::from_fn(colab_observability::http_span));
    let listener =
        tokio::net::TcpListener::bind(env::var("PROBE_ADDRESS")?.parse::<SocketAddr>()?).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
