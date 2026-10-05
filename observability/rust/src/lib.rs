//! Shared instrumentation source, compiled into each independently owned artifact.
//! No credentials, application state or business use cases live here.
pub mod clock;
pub mod ingest;
mod operation;
pub use operation::{business, prompt, prompt_at, context_json, resume, registered_business};
use axum::{
    extract::MatchedPath,
    http::{HeaderMap, Request},
    middleware::Next,
    response::Response,
};
use opentelemetry::{
    Context, KeyValue, global, baggage::BaggageExt,
    propagation::{Extractor, Injector},
    trace::{Span, SpanKind, Status, TraceContextExt, Tracer, TracerProvider},
};
use opentelemetry_otlp::{WithExportConfig, WithHttpConfig};
use opentelemetry_sdk::{Resource, propagation::TraceContextPropagator, trace::SdkTracerProvider};
pub use reqwest_middleware::{ClientWithMiddleware as Client, RequestBuilder};
use std::time::Instant;
use tracing_subscriber::prelude::*;
static SERVER_CLOCK: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
tokio::task_local! { static CURRENT: Context; }

pub struct TelemetryGuard(Option<SdkTracerProvider>);
impl Drop for TelemetryGuard {
    fn drop(&mut self) {
        if let Some(p) = &self.0 {
            let _ = p.shutdown();
        }
    }
}
/// Disabled unless explicitly configured; exporter failures must never prevent application start.
pub fn init(service: &'static str, version: &'static str) -> TelemetryGuard {
    SERVER_CLOCK.store(
        service == "colab-server",
        std::sync::atomic::Ordering::Relaxed,
    );
    global::set_text_map_propagator(TraceContextPropagator::new());
    if std::env::var_os("OTEL_EXPORTER_OTLP_ENDPOINT").is_none()
        && std::env::var_os("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT").is_none()
    {
        return TelemetryGuard(None);
    }
    let result = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_timeout(std::time::Duration::from_secs(5))
        .build();
    install(service, version, result)
}
/// Core exports through its own authenticated loopback intake; only Server holds vendor secrets.
pub fn init_local(
    service: &'static str,
    version: &'static str,
    endpoint: String,
    bearer: String,
) -> TelemetryGuard {
    global::set_text_map_propagator(TraceContextPropagator::new());
    if !std::env::var("COLAB_TRACING_ENABLED").is_ok_and(|v| v == "1") {
        return TelemetryGuard(None);
    }
    let Ok(Ok(client)) =
        std::thread::spawn(|| reqwest::blocking::Client::builder().no_proxy().build()).join()
    else {
        return TelemetryGuard(None);
    };
    let result = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_http_client(client)
        .with_endpoint(endpoint)
        .with_headers(std::collections::HashMap::from([(
            "authorization".into(),
            format!("Bearer {bearer}"),
        )]))
        .with_timeout(std::time::Duration::from_secs(3))
        .build();
    install(service, version, result)
}
fn install(
    service: &'static str,
    version: &'static str,
    result: Result<opentelemetry_otlp::SpanExporter, opentelemetry_otlp::ExporterBuildError>,
) -> TelemetryGuard {
    let Ok(exporter) = result else {
        eprintln!("Tracing exporter initialization failed; continuing without tracing");
        return TelemetryGuard(None);
    };
    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(
            Resource::builder()
                .with_service_name(service)
                .with_attributes([KeyValue::new("service.version", version)])
                .build(),
        )
        .build();
    let tracer = provider.tracer("agent-colab");
    let _ = tracing_subscriber::registry()
        .with(tracing_opentelemetry::layer().with_tracer(tracer))
        .try_init();
    global::set_tracer_provider(provider.clone());
    TelemetryGuard(Some(provider))
}
struct Headers<'a>(&'a HeaderMap);
impl Extractor for Headers<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key)?.to_str().ok()
    }
    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(|k| k.as_str()).collect()
    }
}
struct Inject<'a>(&'a mut HeaderMap);
impl Injector for Inject<'_> {
    fn set(&mut self, key: &str, value: String) {
        if let (Ok(k), Ok(v)) = (key.parse::<axum::http::HeaderName>(), value.parse()) {
            self.0.insert(k, v);
        }
    }
}
fn parent() -> Context {
    CURRENT
        .try_with(Clone::clone)
        .unwrap_or_else(|_| Context::current())
}
fn clock_attributes() -> Vec<KeyValue> {
    let calibration = clock::calibration();
    let quality = if SERVER_CLOCK.load(std::sync::atomic::Ordering::Relaxed) {"reference"} else if calibration.is_some() {"estimated"} else {"uncalibrated"};
    let mut attributes=vec![KeyValue::new("colab.clock.quality",quality)];
    if let Some(c)=calibration {attributes.extend([KeyValue::new("colab.clock.offset_ms",c.offset_ms),KeyValue::new("colab.clock.uncertainty_ms",c.uncertainty_ms)]);}
    attributes
}
/// Deliberately omit raw URLs, query strings, headers, request/response bodies and error messages.
pub fn route(path: &str) -> String {
    path.split('/')
        .map(|s| {
            if s.len() > 24 || s.chars().all(|c| c.is_ascii_digit()) && !s.is_empty() {
                "{id}"
            } else {
                s
            }
        })
        .collect::<Vec<_>>()
        .join("/")
}
pub async fn http_span(mut request: Request<axum::body::Body>, next: Next) -> Response {
    let received = clock::millis(clock::now());
    let path = request
        .extensions()
        .get::<MatchedPath>()
        .map(|p| p.as_str().to_owned())
        .unwrap_or_else(|| "unmatched".to_owned());
    if path.contains("/observability/") || path.starts_with("/health/") || path == "/v1/status" {
        return next.run(request).await;
    }
    // Native img/iframe loads cannot set headers. The authenticated same-origin GUI supplies
    // only fixed-format correlation IDs; never put credentials or arbitrary baggage in this URL.
    if path.ends_with("/raw") && request.headers().get("traceparent").is_none() {
        let query = request.uri().query().unwrap_or("").to_owned();
        for item in query.split('&') {
            if let Some(value) = item.strip_prefix("__traceparent=").filter(|v|v.len()==55 && v.bytes().all(|b|b.is_ascii_hexdigit() || b==b'-')).and_then(|v|v.parse().ok()) {request.headers_mut().insert("traceparent",value);}
            if let Some(id) = item.strip_prefix("__trace_entry=").filter(|v|v.len()<=128 && v.bytes().all(|b|b.is_ascii_alphanumeric() || b"._-".contains(&b))) {if let Ok(value)=format!("trace.entry.id={id}").parse(){request.headers_mut().insert("baggage",value);}}
        }
    }
    let mut parent = global::get_text_map_propagator(|p| p.extract(&Headers(request.headers())));
    // Only the registered entry vocabulary may cross this boundary; arbitrary baggage is not forwarded.
    if let Some(id) = request.headers().get("baggage").and_then(|v|v.to_str().ok()).and_then(|v|v.split(',').find_map(|p|p.trim().strip_prefix("trace.entry.id="))).filter(|id|id.len()<=128 && id.bytes().all(|b|b.is_ascii_alphanumeric() || b"._-".contains(&b))) {
        parent=parent.with_baggage([KeyValue::new("trace.entry.id",id.to_owned())]);
    }
    let tracer = global::tracer("agent-colab.boundary");
    let start = clock::now();
    let instant = Instant::now();
    let mut span = tracer
        .span_builder(format!("{} {}", request.method(), path))
        .with_kind(SpanKind::Server)
        .with_start_time(start)
        .with_attributes([
            KeyValue::new("http.request.method", request.method().to_string()),
            KeyValue::new("http.route", path),
        ])
        .start_with_context(&tracer, &parent);
    for attribute in clock_attributes() {span.set_attribute(attribute);}
    if let Some(id)=parent.baggage().get("trace.entry.id") {span.set_attribute(KeyValue::new("trace.entry.id",id.to_string()));}
    span.set_attribute(KeyValue::new("code.revision",option_env!("COLAB_CODE_REVISION").unwrap_or("unknown")));
    span.set_attribute(KeyValue::new("code.file.path","observability/rust/src/lib.rs"));
    span.set_attribute(KeyValue::new("code.function.name","http_span"));
    let cx = parent.with_span(span);
    let mut response = CURRENT.scope(cx.clone(), next.run(request)).await;
    let duration = instant.elapsed();
    cx.span().set_attribute(KeyValue::new(
        "http.response.status_code",
        response.status().as_u16() as i64,
    ));
    cx.span().set_attribute(KeyValue::new(
        "colab.duration_ms",
        duration.as_secs_f64() * 1000.0,
    ));
    if response.status().is_server_error() {
        cx.span().set_status(Status::error("server_error"));
    }
    cx.span().end_with_timestamp(start + duration);
    // Timestamp headers measure the request boundary, not network one-way latency.
    for (k, v) in [
        ("x-colab-received-ms", received),
        ("x-colab-sent-ms", clock::millis(clock::now())),
    ] {
        if let Ok(v) = v.to_string().parse() {
            response.headers_mut().insert(k, v);
        }
    }
    response
}
#[derive(Debug)]
struct Propagate;
#[async_trait::async_trait]
impl reqwest_middleware::Middleware for Propagate {
    async fn handle(
        &self,
        mut req: reqwest::Request,
        ext: &mut http::Extensions,
        next: reqwest_middleware::Next<'_>,
    ) -> reqwest_middleware::Result<reqwest::Response> {
        let tracer = global::tracer("agent-colab.boundary");
        let parent = parent();
        let start = clock::now();
        let instant = Instant::now();
        let mut span = tracer
            .span_builder(format!("HTTP {}", req.method()))
            .with_kind(SpanKind::Client)
            .with_start_time(start)
            .with_attributes([KeyValue::new(
                "http.request.method",
                req.method().to_string(),
            )])
            .start_with_context(&tracer, &parent);
        if let Some(id)=parent.baggage().get("trace.entry.id") {
            span.set_attribute(KeyValue::new("trace.entry.id",id.to_string()));
            if let Ok(v)=format!("trace.entry.id={id}").parse(){req.headers_mut().insert("baggage",v);}
        }
        span.set_attribute(KeyValue::new("code.revision",option_env!("COLAB_CODE_REVISION").unwrap_or("unknown")));
    span.set_attribute(KeyValue::new("code.file.path","observability/rust/src/lib.rs"));
        span.set_attribute(KeyValue::new("code.function.name","Propagate::handle"));
        for attribute in clock_attributes() {span.set_attribute(attribute);}
        let cx = parent.with_span(span);
        global::get_text_map_propagator(|p| p.inject_context(&cx, &mut Inject(req.headers_mut())));
        let result = CURRENT.scope(cx.clone(), next.run(req, ext)).await;
        if let Ok(r) = &result {
            cx.span().set_attribute(KeyValue::new(
                "http.response.status_code",
                r.status().as_u16() as i64,
            ));
            if r.status().is_server_error() {
                cx.span().set_status(Status::error("server_error"));
            }
        } else {
            cx.span().set_status(Status::error("transport_error"));
        }
        let duration = instant.elapsed();
        cx.span().set_attribute(KeyValue::new(
            "colab.duration_ms",
            duration.as_secs_f64() * 1000.0,
        ));
        cx.span().end_with_timestamp(start + duration);
        result
    }
}
pub fn client() -> Client {
    reqwest_middleware::ClientBuilder::new(reqwest::Client::new())
        .with(Propagate)
        .build()
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockReply {
    received_ms: f64,
    sent_ms: f64,
    reference: &'static str,
    calibration: Option<clock::Calibration>,
}
pub async fn clock_reply() -> axum::Json<ClockReply> {
    let received_ms = clock::millis(clock::now());
    axum::Json(ClockReply {
        received_ms,
        sent_ms: clock::millis(clock::now()),
        reference: if SERVER_CLOCK.load(std::sync::atomic::Ordering::Relaxed) {
            "server"
        } else if clock::calibration().is_some() {
            "server-estimated"
        } else {
            "local"
        },
        calibration: clock::calibration(),
    })
}
pub async fn calibrate(endpoint: &str) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap();
    let mut best = None;
    for _ in 0..3 {
        let t1 = clock::millis(clock::raw_now());
        if let Ok(r) = client.get(endpoint).send().await {
            if let Ok(v) = r.json::<serde_json::Value>().await {
                let t4 = clock::millis(clock::raw_now());
                if let (Some(t2), Some(t3)) = (v["receivedMs"].as_f64(), v["sentMs"].as_f64()) {
                    if let Some(c) = clock::estimate(t1, t2, t3, t4) {
                        if best
                            .is_none_or(|b: clock::Calibration| c.uncertainty_ms < b.uncertainty_ms)
                        {
                            best = Some(c);
                        }
                    }
                }
            }
        }
    }
    if let Some(c) = best {
        clock::set_calibration(c);
    }
}
