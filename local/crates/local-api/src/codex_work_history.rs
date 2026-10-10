//! Repair sparse app-server turn snapshots from the same native rollout, never a nearby turn.
use serde_json::{Value, json};
use std::{fs, io::{BufRead, BufReader}, path::{Path, PathBuf}};

pub(super) fn enrich(thread: &str, request: &str, turn: &Value) -> Value {
    let Some(home) = std::env::var_os("CODEX_HOME").map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".codex"))) else {return turn.clone()};
    let Some(path) = rollout(&home, thread) else {return turn.clone()};
    let Ok(file) = fs::File::open(path) else {return turn.clone()};
    let rows = BufReader::new(file).lines().map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<Value>(&line).ok());
    enrich_rows(thread, request, turn, rows)
}
fn rollout(home: &Path, thread: &str) -> Option<PathBuf> {
    let mut dbs: Vec<_> = fs::read_dir(home).ok()?.flatten().map(|e|e.path()).filter(|p|
        p.file_name().and_then(|v|v.to_str()).is_some_and(|n|n.starts_with("state_")&&n.ends_with(".sqlite"))).collect();
    dbs.sort();
    for path in dbs.into_iter().rev() {
        let Ok(db)=rusqlite::Connection::open_with_flags(path,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) else {continue};
        let Ok(raw)=db.query_row("select rollout_path from threads where id=?1",[thread],|r|r.get::<_,String>(0)) else {continue};
        let path=PathBuf::from(raw).canonicalize().ok()?;
        // Native metadata cannot redirect transcript recovery outside Codex's stores.
        if ["sessions","archived_sessions"].iter().any(|d|home.join(d).canonicalize().is_ok_and(|root|path.starts_with(root))) {return Some(path)}
    }
    None
}
fn enrich_rows(thread: &str, request: &str, turn: &Value, rows: impl Iterator<Item=Value>) -> Value {
    let Some(turn_id)=turn["id"].as_str() else {return turn.clone()};
    let mut selected=Vec::new();let mut active=false;let mut matched=false;let mut terminal=None;
    for row in rows {
        let p=&row["payload"];
        if row["type"]=="event_msg" && p["type"]=="task_started" {active=p["turn_id"]==turn_id;}
        if !active {continue}
        if p["type"]=="item_completed" && p["thread_id"]==thread && p["turn_id"]==turn_id
            && p["item"]["type"]=="UserMessage" && p["item"]["client_id"]==request {matched=true;}
        if p["type"]=="task_complete" && p["turn_id"]==turn_id {terminal=Some("completed");}
        if p["type"]=="turn_aborted" && p["turn_id"]==turn_id {terminal=Some("interrupted");}
        let ended=terminal.is_some();
        selected.push(row);
        if ended {active=false;}
    }
    if !matched {return turn.clone()}
    let projected=super::sessions::project_codex_rows(selected.into_iter().enumerate(),true,4000);
    let mut result=turn.clone();
    let mut items=turn["items"].as_array().cloned().unwrap_or_default();
    let native:Vec<_>=projected.into_iter().flat_map(|t|t["items"].as_array().cloned().unwrap_or_default())
        .filter(|i|i["type"]!="userMessage").collect();
    // Live snapshots win when complete. Repair only a snapshot missing execution items.
    if native.len()>items.iter().filter(|i|i["type"]!="userMessage").count() {
        items.retain(|i|i["type"]=="userMessage");items.extend(native);result["items"]=json!(items);
        if let Some(status)=terminal {result["status"]=json!(status);result["error"]=Value::Null;}
        eprintln!("Codex work history repaired thread={thread} turn={turn_id} request={request} items={}",result["items"].as_array().map_or(0,Vec::len));
    }
    result
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn repairs_only_exact_client_and_turn_without_neighbor_items() {
  let turn=json!({"id":"owned","status":"interrupted","items":[{"type":"userMessage","clientId":"request"}]});
  let rows=vec![json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"neighbor"}}),json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"text":"PRIVATE NEIGHBOR"}]}}),json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"owned"}}),json!({"type":"event_msg","payload":{"type":"item_completed","thread_id":"thread","turn_id":"owned","item":{"type":"UserMessage","client_id":"request"}}}),json!({"type":"response_item","payload":{"type":"custom_tool_call","call_id":"call","name":"exec","input":"pwd"}}),json!({"type":"response_item","payload":{"type":"custom_tool_call_output","call_id":"call","output":"/workspace"}}),json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"text":"Done"}]}}),json!({"type":"event_msg","payload":{"type":"task_complete","turn_id":"owned"}})];
  let got=enrich_rows("thread","request",&turn,rows.clone().into_iter());assert_eq!(got["status"],"completed");assert_eq!(got["items"].as_array().unwrap().len(),3);assert!(!got.to_string().contains("PRIVATE NEIGHBOR"));assert_eq!(enrich_rows("thread","other",&turn,rows.into_iter()),turn);
 }
}
