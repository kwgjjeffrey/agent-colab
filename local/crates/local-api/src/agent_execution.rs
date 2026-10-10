//! Durable execution identity and terminal-report retry, independent of a runtime socket.
//! Recovery observes native turns; it never replays work or publishes a synthesized Agent reply.
use super::*;

const SCHEMA: &str = "create table if not exists agent_executions(request_id text primary key,user_id text not null,thread_id text,status text not null default 'running',error text,reported integer not null default 0)";

pub(super) async fn begin(state: &AppState, user: &str, request: &str, thread: Option<&str>) -> Result<(), LocalError> {
    let db = state.inner.store.lock().await;
    db.execute_batch(SCHEMA).map_err(LocalError::internal)?;
    if db.execute("insert or ignore into agent_executions(request_id,user_id,thread_id) values(?1,?2,?3)", rusqlite::params![request,user,thread]).map_err(LocalError::internal)? == 0 {
        return Err(LocalError::internal("This Agent request already has a durable execution; recovery must not replay it"));
    }
    Ok(())
}

pub(super) async fn bind_thread(state: &AppState, request: &str, thread: &str) -> Result<(), LocalError> {
    state.inner.store.lock().await.execute("update agent_executions set thread_id=?2 where request_id=?1", rusqlite::params![request,thread]).map_err(LocalError::internal)?;
    Ok(())
}

pub(super) async fn finish(state: &AppState, request: &str, result: &std::io::Result<()>) -> Result<(), LocalError> {
    let error = result.as_ref().err().map(|e| e.to_string());
    state.inner.store.lock().await.execute("update agent_executions set status=?2,error=?3 where request_id=?1 and status='running'", rusqlite::params![request,if result.is_ok(){"completed"}else{"failed"},error]).map_err(LocalError::internal)?;
    Ok(())
}

pub(super) async fn recover_legacy(state: &AppState, user: &str, runtime: &str) {
    let bindings = {
        let db = state.inner.store.lock().await;
        if db.execute_batch(SCHEMA).is_err() { return; }
        let Ok(mut query) = db.prepare("select channel_id,blueprint_id,provider_thread_id from agent_thread_bindings where runtime_id=?1") else { return };
        query.query_map([runtime], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?)))
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>()).unwrap_or_default()
    };
    let Ok(token) = access_token_for_user(state,user).await else { return };
    for (channel,blueprint,thread) in bindings {
        let Ok(response) = state.inner.http.get(format!("{}/v1/channels/{channel}/agent-requests",state.inner.server_url))
            .bearer_auth(&token).timeout(std::time::Duration::from_secs(15)).send().await else { continue };
        if !response.status().is_success() { continue; }
        let Ok(rows) = response.json::<Vec<serde_json::Value>>().await else { continue };
        for row in rows {
            if row["state"] != "running" || row["runtimeId"] != runtime || row["targetBlueprintId"] != blueprint { continue; }
            let Some(request) = row["id"].as_str() else { continue };
            // Upgrade recovery is permitted only with an exact native client-message identity.
            // The binding alone cannot establish that this request was ever actually executed.
            let Ok(Some(_)) = state.inner.codex.request_status(thread.clone(),request.into()).await else { continue };
            let _ = state.inner.store.lock().await.execute("insert or ignore into agent_executions(request_id,user_id,thread_id) values(?1,?2,?3)",rusqlite::params![request,user,thread]);
        }
    }
}

pub(super) fn start(state: &AppState) {
    let state = state.clone();
    tokio::spawn(async move {
        if let Err(error) = state.inner.store.lock().await.execute_batch(SCHEMA) {
            eprintln!("Agent execution journal unavailable: {error}");
            return;
        }
        loop {
            let rows = {
                let db = state.inner.store.lock().await;
                let mut query = db.prepare("select request_id,user_id,thread_id,status,error from agent_executions where reported=0").expect("execution schema initialized");
                query.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,Option<String>>(2)?,r.get::<_,String>(3)?,r.get::<_,Option<String>>(4)?)))
                    .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>()).unwrap_or_default()
            };
            for (request,user,thread,mut status,mut error) in rows {
                if status == "running" {
                    let Some(thread) = thread else { continue };
                    let Ok(Some(turn)) = state.inner.codex.request_status(thread.clone(), request.clone()).await else { continue };
                    let native = turn["status"].as_str().unwrap_or("unknown");
                    if !["completed","failed","interrupted"].contains(&native) { continue; }
                    status = if native == "completed" { "completed".into() } else { "failed".into() };
                    error = (native != "completed").then(|| format!("Codex turn ended with status {native}"));
                    let mut events = turn["items"].as_array().into_iter().flatten().map(|item|
                        serde_json::json!({"method":"item/completed","params":{"threadId":thread,"turnId":turn["id"],"item":item}})).collect::<Vec<_>>();
                    events.push(serde_json::json!({"method":"turn/completed","params":{"threadId":thread,"turn":turn}}));
                    if super::work_events::persist(&state,&user,&request,events).await.is_err() { continue; }
                    let _ = state.inner.store.lock().await.execute("update agent_executions set status=?2,error=?3 where request_id=?1 and status='running'",rusqlite::params![request,status,error]);
                }
                let Ok(token) = access_token_for_user(&state,&user).await else { continue };
                let route = if status == "completed" { "complete" } else { "fail" };
                let response = state.inner.http.post(format!("{}/v1/agent-requests/{request}/{route}",state.inner.server_url))
                    .bearer_auth(token).json(&serde_json::json!({"error":error.unwrap_or_else(||"Provider execution failed".into())}))
                    .timeout(std::time::Duration::from_secs(15)).send().await;
                if response.is_ok_and(|r| r.status().is_success()) {
                    let _ = state.inner.store.lock().await.execute("update agent_executions set reported=1 where request_id=?1",[&request]);
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });
}
