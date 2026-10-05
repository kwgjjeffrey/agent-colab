//! Task-local span scopes survive await and concurrent requests without thread-local leakage.
use super::*;
use std::future::Future;

pub async fn business<T, E>(id: &str, file: &str, function: &str, future: impl Future<Output = Result<T, E>>) -> Result<T, E> {
    let parent = parent();
    if !parent.span().span_context().is_valid() { return future.await; }
    let tracer = global::tracer("agent-colab.business");
    let start = clock::now();
    let tick = Instant::now();
    let span = tracer.span_builder(format!("colab.{id}")).with_start_time(start).with_attributes([
        KeyValue::new("trace.operation.id", id.to_owned()), KeyValue::new("code.file.path", file.to_owned()),
        KeyValue::new("code.function.name", function.to_owned()), KeyValue::new("code.revision", option_env!("COLAB_CODE_REVISION").unwrap_or("unknown")),
    ]).start_with_context(&tracer, &parent);
    let cx = parent.with_span(span);
    for attribute in clock_attributes() {cx.span().set_attribute(attribute);}
    if let Some(id) = cx.baggage().get("trace.entry.id") { cx.span().set_attribute(KeyValue::new("trace.entry.id", id.to_string())); }
    let result = CURRENT.scope(cx.clone(), future).await;
    let elapsed = tick.elapsed();
    cx.span().set_attribute(KeyValue::new("colab.duration_ms", elapsed.as_secs_f64()*1000.));
    cx.span().set_attribute(KeyValue::new("colab.outcome", if result.is_ok() {"success"} else {"error"}));
    if result.is_err() { cx.span().set_status(Status::error("business_error")); }
    cx.span().end_with_timestamp(start + elapsed);
    result
}

/// Capture the actual assembled command at its final assembly site, never an intermediate template.
/// Server-built prompts contain no provider credentials; capability handoff prompts must be redacted at their owner.
pub fn prompt_at(kind: &str, stage: &str, request: Option<String>, content: &str, file: &'static str, function: &'static str) {
    let parent = parent(); let tracer = global::tracer("agent-colab.prompt");
    let start=clock::now(); let tick=Instant::now();
    let mut span = tracer.span_builder("colab.prompt.assemble").with_start_time(start).with_attributes([
        KeyValue::new("code.file.path", file.to_owned()), KeyValue::new("code.function.name", function.to_owned()),
        KeyValue::new("code.revision", option_env!("COLAB_CODE_REVISION").unwrap_or("unknown")),
        KeyValue::new("prompt.kind", kind.to_owned()), KeyValue::new("prompt.stage", stage.to_owned()),
        KeyValue::new("prompt.template.version", "1"), KeyValue::new("prompt.bytes", content.len() as i64),
    ]).start_with_context(&tracer, &parent);
    for attribute in clock_attributes() {span.set_attribute(attribute);}
    if let Some(id) = parent.baggage().get("trace.entry.id") {span.set_attribute(KeyValue::new("trace.entry.id", id.to_string()));}
    if let Some(id) = request {span.set_attribute(KeyValue::new("colab.request_id", id));}
    // UTF-8 boundary-safe limit; never silently claim a truncated prompt is complete.
    let mut limit = content.len().min(128*1024); while !content.is_char_boundary(limit) {limit-=1;}
    span.set_attribute(KeyValue::new("prompt.content", content[..limit].to_owned()));
    span.set_attribute(KeyValue::new("prompt.truncated", limit<content.len())); span.end_with_timestamp(start+tick.elapsed());
}

/// Versioned allowlisted envelope is persisted with the business command in the same transaction.
pub fn context_json() -> serde_json::Value {
    let cx = parent();
    if !cx.span().span_context().is_valid() {return serde_json::Value::Null;}
    let mut headers = HeaderMap::new();
    global::get_text_map_propagator(|p| p.inject_context(&cx, &mut Inject(&mut headers)));
    serde_json::json!({"version":1,"traceparent":headers.get("traceparent").and_then(|v|v.to_str().ok()),"entryId":cx.baggage().get("trace.entry.id").map(|v|v.to_string())})
}
pub async fn resume<F: Future>(envelope: &serde_json::Value, future: F) -> F::Output {
    let mut headers = HeaderMap::new();
    if envelope["version"] == 1 {
        if let Some(value) = envelope["traceparent"].as_str().filter(|s|s.len()==55).and_then(|v|v.parse().ok()) {headers.insert("traceparent",value);}
    }
    let mut cx = global::get_text_map_propagator(|p| p.extract(&Headers(&headers)));
    if let Some(id) = envelope["entryId"].as_str().filter(|id|id.len()<=128 && id.bytes().all(|b|b.is_ascii_alphanumeric() || b"._-".contains(&b))) {cx=cx.with_baggage([KeyValue::new("trace.entry.id",id.to_owned())]);}
    CURRENT.scope(cx, future).await
}

/// Service-owned registry is shipped unchanged; source metadata isn't copied into call sites.
pub async fn registered_business<T,E>(registry: &'static str, id: &str, future: impl Future<Output=Result<T,E>>) -> Result<T,E> {
    static REGISTRIES: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<&'static str,serde_json::Value>>> = std::sync::OnceLock::new();
    let row = {
        let mut values = REGISTRIES.get_or_init(Default::default).lock().unwrap_or_else(|e| e.into_inner());
        let value = values.entry(registry).or_insert_with(||serde_json::from_str(registry).unwrap_or_default());
        value["spans"].as_array().and_then(|rows|rows.iter().find(|row|row["id"]==id)).cloned().unwrap_or_default()
    };
    business(id, row["source"]["path"].as_str().unwrap_or("unknown"), row["source"]["function"].as_str().unwrap_or("unknown"), future).await
}

pub fn prompt(kind: &str, request: Option<String>, content: &str, file: &'static str, function: &'static str) {prompt_at(kind,"preview",request,content,file,function)}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry_sdk::trace::{SpanData, SpanExporter, SdkTracerProvider};
    use std::sync::{Arc,Mutex};
    #[derive(Clone,Debug,Default)]
    struct Capture(Arc<Mutex<Vec<SpanData>>>);
    impl SpanExporter for Capture {
        async fn export(&self, batch: Vec<SpanData>) -> opentelemetry_sdk::error::OTelSdkResult {self.0.lock().unwrap().extend(batch);Ok(())}
    }
    #[test]
    fn concurrent_scopes_and_persisted_context_keep_prompt_on_the_original_trace() {
        let runtime=tokio::runtime::Builder::new_current_thread().build().unwrap();
        runtime.block_on(async {
            global::set_text_map_propagator(TraceContextPropagator::new());
            let capture=Capture::default();let provider=SdkTracerProvider::builder().with_simple_exporter(capture.clone()).build();global::set_tracer_provider(provider.clone());
            let tracer=provider.tracer("test");
            let a=Context::new().with_baggage([KeyValue::new("trace.entry.id","canvas.agent.send")]).with_span(tracer.start("colab.test.a"));
            let b=Context::new().with_baggage([KeyValue::new("trace.entry.id","messages.send")]).with_span(tracer.start("colab.test.b"));
            let aid=a.span().span_context().trace_id();let bid=b.span().span_context().trace_id();
            let saved=CURRENT.scope(a.clone(),async {context_json()}).await;
            let a_copy=a.clone();let b_copy=b.clone();
            let first=tokio::spawn(async move { CURRENT.scope(a_copy,business("test.first","test.rs","first",async {tokio::task::yield_now().await;Ok::<(),()>(())})).await });
            let second=tokio::spawn(async move { CURRENT.scope(b_copy,business("test.second","test.rs","second",async {tokio::task::yield_now().await;Err::<(),()>(())})).await });
            first.await.unwrap().unwrap();assert!(second.await.unwrap().is_err());
            a.span().end();b.span().end();
            // Simulates a command read after its original request/context scope has ended.
            let persisted=serde_json::from_str::<serde_json::Value>(&saved.to_string()).unwrap();
            resume(&persisted,async {prompt_at("canvas_mention","dispatch",Some("request-test".into()),"Final task\nRead document; then reply.","prompt.rs","assemble");}).await;
            provider.force_flush().unwrap();
            let rows=capture.0.lock().unwrap();
            let find=|name:&str|rows.iter().find(|s|s.name==name).unwrap();
            assert_eq!(find("colab.test.first").span_context.trace_id(),aid);
            assert_eq!(find("colab.test.second").span_context.trace_id(),bid);
            assert_eq!(find("colab.prompt.assemble").span_context.trace_id(),aid);
            let prompt=find("colab.prompt.assemble");
            assert!(prompt.attributes.iter().any(|a|a.key.as_str()=="prompt.content" && a.value.as_str()=="Final task\nRead document; then reply."));
            assert!(prompt.attributes.iter().any(|a|a.key.as_str()=="trace.entry.id" && a.value.as_str()=="canvas.agent.send"));
            assert!(matches!(find("colab.test.second").status,Status::Error{..}));
        });
    }
}
