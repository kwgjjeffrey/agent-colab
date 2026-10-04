//! Product resource identities, not CRDT identities. Tool instructions are consolidated once.
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(super) struct ContextRef { pub kind: String, pub id: Uuid }
pub(super) fn references(value: &serde_json::Value) -> Vec<ContextRef> {
    fn visit(value: &serde_json::Value, rows: &mut Vec<ContextRef>) {
        if value["type"] == "mention" {
            if let (Some(kind), Some(id)) = (value["attrs"]["kind"].as_str(), value["attrs"]["id"].as_str().and_then(|raw| Uuid::parse_str(raw).ok())) {
                if ["files", "session", "canvas", "message"].contains(&kind) && !rows.iter().any(|row| row.kind == kind && row.id == id) { rows.push(ContextRef { kind: kind.into(), id }); }
            }
        }
        if let Some(children) = value["content"].as_array() { for child in children { visit(child, rows); } }
    }
    let mut rows = Vec::new(); visit(value, &mut rows); rows
}
pub(super) fn projection(value: &serde_json::Value) -> String {
    match value["type"].as_str() {
        Some("text") => value["text"].as_str().unwrap_or("").into(),
        Some("mention") => {
            let label = value["attrs"]["label"].as_str().unwrap_or("Context");
            let kind = value["attrs"]["kind"].as_str().unwrap_or("agent");
            if ["files", "session", "canvas", "message"].contains(&kind) { format!("[{label} · {kind}:{}]", value["attrs"]["id"].as_str().unwrap_or("")) } else { format!("@{label}") }
        }
        Some("hardBreak") => "\n".into(),
        _ => format!("{}{}", value["content"].as_array().map(|rows| rows.iter().map(projection).collect::<String>()).unwrap_or_default(), if value["type"] == "paragraph" { "\n" } else { "" }),
    }
}
pub(super) fn message_text(row: &colab_server_persistence::ChannelMessage) -> String {
    if row.content["content"].as_array().is_some_and(|rows| !rows.is_empty()) { projection(&row.content).trim_end().into() } else { row.body.clone() }
}
pub(super) fn instructions(channel: Uuid, rows: &[ContextRef]) -> String {
    let root = "~/.agents/skills/agent-colab/bin";
    ["files", "session", "canvas", "message"].iter().filter_map(|kind| {
        let ids = rows.iter().filter(|row| row.kind == *kind).map(|row| row.id).collect::<std::collections::BTreeSet<_>>();
        if ids.is_empty() { return None; }
        let commands = ids.into_iter().map(|id| match *kind {
            "files" => format!("{root}/colab-browser use --ref 'colab://channel/{channel}/{id}'"),
            "session" => format!("{root}/colab-session-reader read --ref 'colab://channel/{channel}/{id}' --turn-limit 20 --include-outputs --max-output-chars-per-item 4000"),
            "canvas" => format!("{root}/colab-canvas read --ref 'colab://channel/{channel}/canvas/{id}'"),
            _ => format!("{root}/colab-messages messages read --channel '{channel}' --id '{id}'"),
        }).collect::<Vec<_>>().join("\n");
        Some(format!("How to read {}:\n{commands}", match *kind { "session" => "sessions", "message" => "messages", other => other }))
    }).collect::<Vec<_>>().join("\n\n")
}
