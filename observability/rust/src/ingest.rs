//! Authenticated callers are still untrusted telemetry producers. Re-encode a bounded,
//! allow-listed OTLP payload before letting it cross the application trust boundary.
use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;
use prost::Message;
pub fn sanitize(bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
    if bytes.len() > 1024 * 1024 {
        return Err("payload_too_large");
    }
    let mut data = ExportTraceServiceRequest::decode(bytes).map_err(|_| "invalid_otlp")?;
    let mut count = 0;
    for resource in &mut data.resource_spans {
        resource.schema_url.clear();
        if let Some(r) = &mut resource.resource {
            r.entity_refs.clear();
        }
        if let Some(r) = &mut resource.resource {
            r.attributes.retain(|a| {
                matches!(
                    a.key.as_str(),
                    "service.name" | "service.version" | "deployment.environment.name"
                )
            });
        }
        for scope in &mut resource.scope_spans {
            scope.schema_url.clear();
            if let Some(s) = &mut scope.scope {
                s.attributes.clear();
            }
            for span in &mut scope.spans {
                count += 1;
                if count > 512 {
                    return Err("too_many_spans");
                }
                if span.trace_id.len() != 16
                    || span.span_id.len() != 8
                    || (!span.parent_span_id.is_empty() && span.parent_span_id.len() != 8)
                    || span.end_time_unix_nano < span.start_time_unix_nano
                {
                    return Err("invalid_span");
                }
                // Only static operation names and templated HTTP routes may be exported.
                if span.name.len() > 160
                    || span.name.contains('?')
                    || span.name.contains("colab://")
                    || !(span.name.starts_with("colab.")
                        || span.name.starts_with("HTTP ")
                        || ["GET ", "POST ", "PATCH ", "DELETE ", "PUT "]
                            .iter()
                            .any(|p| span.name.starts_with(p)))
                {
                    span.name = "colab.unclassified".into();
                }
                span.events.clear();
                span.trace_state.clear();
                span.attributes.retain(|a| allowed(&a.key));
                for link in &mut span.links {
                    link.attributes.clear();
                    link.trace_state.clear();
                }
                if let Some(s) = &mut span.status {
                    s.message.clear();
                }
            }
        }
    }
    if count == 0 {
        return Err("empty_batch");
    }
    Ok(data.encode_to_vec())
}
fn allowed(k: &str) -> bool {
    matches!(
        k,
        "http.request.method"
            | "http.route"
            | "http.response.status_code"
            | "error.type"
            | "trace.entry.id"
            | "trace.operation.id"
            | "trace.registry.unit"
            | "prompt.kind"
            | "prompt.stage"
            | "prompt.target"
            | "prompt.template.version"
            | "prompt.content"
            | "prompt.bytes"
            | "prompt.redacted"
            | "prompt.truncated"
            | "trace.registry.digest"
            | "code.file.path"
            | "code.function.name"
            | "code.revision"
            | "colab.operation"
            | "colab.operation_id"
            | "colab.phase"
            | "colab.outcome"
            | "colab.origin"
            | "colab.duration_ms"
            | "colab.telemetry.init_ms"
            | "colab.exit_code"
            | "colab.clock.offset_ms"
            | "colab.clock.uncertainty_ms"
            | "colab.clock.quality"
            | "colab.request_id"
            | "colab.attempt"
            | "colab.coverage"
            | "canvas.id"
            | "canvas.update.id"
            | "canvas.update.bytes"
            | "canvas.sync.trigger"
            | "canvas.sync.stage"
            | "canvas.sync.http_status"
            | "canvas.sync.cursor.before"
            | "canvas.sync.cursor.after"
            | "canvas.sync.pending"
            | "canvas.sync.update_count"
            | "canvas.sync.state"
            | "canvas.sync.recovered"
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry_proto::tonic::{
        common::v1::KeyValue,
        trace::v1::{ResourceSpans, ScopeSpans, Span},
    };
    #[test]
    fn retains_canvas_diagnostics_without_document_content() {
        assert!(allowed("canvas.id"));
        assert!(allowed("canvas.sync.stage"));
        assert!(allowed("canvas.sync.http_status"));
        assert!(allowed("canvas.sync.recovered"));
        assert!(!allowed("canvas.content"));
        assert!(!allowed("canvas.image_interpretation"));
    }
    #[test]
    fn rejects_invalid_and_strips_secrets() {
        let mut span = Span {
            trace_id: vec![1; 16],
            span_id: vec![2; 8],
            name: "colab.messages.send".into(),
            start_time_unix_nano: 100,
            end_time_unix_nano: 200,
            attributes: vec![
                KeyValue {
                    key: "authorization".into(),
                    value: None,
                    ..Default::default()
                },
                KeyValue {
                    key: "colab.outcome".into(),
                    value: None,
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let make = |s| {
            ExportTraceServiceRequest {
                resource_spans: vec![ResourceSpans {
                    scope_spans: vec![ScopeSpans {
                        spans: vec![s],
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
            }
            .encode_to_vec()
        };
        let clean =
            ExportTraceServiceRequest::decode(sanitize(&make(span.clone())).unwrap().as_slice())
                .unwrap();
        assert_eq!(
            clean.resource_spans[0].scope_spans[0].spans[0]
                .attributes
                .len(),
            1
        );
        span.trace_id.clear();
        assert_eq!(sanitize(&make(span)).unwrap_err(), "invalid_span");
    }
}

/// Decode the standard OTLP response, including a zero-rejection partial-success message.
pub fn fully_accepted(bytes: &[u8]) -> bool {
    use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceResponse;
    ExportTraceServiceResponse::decode(bytes)
        .is_ok_and(|r| r.partial_success.is_none_or(|p| p.rejected_spans == 0))
}
