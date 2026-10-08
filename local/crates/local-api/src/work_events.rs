//! Request-bound provider transcripts survive temporary Server upload failures.
//! Delivery success is independent of diagnostics, but diagnostics must not be silently discarded.
use super::*;

pub(super) async fn persist(
    state: &AppState,
    user: &str,
    request: &str,
    events: Vec<serde_json::Value>,
) -> Result<(), LocalError> {
    let payload = serde_json::to_string(
        &serde_json::json!({"events": events.into_iter().take(2000).collect::<Vec<_>>() }),
    )
    .map_err(LocalError::internal)?;
    state.inner.store.lock().await.execute("insert into agent_work_outbox(user_id,request_id,payload) values(?1,?2,?3) on conflict(user_id,request_id) do update set payload=excluded.payload", rusqlite::params![user,request,payload]).map_err(LocalError::internal)?;
    Ok(())
}

pub(super) fn start(state: &AppState) {
    let state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            let pending = {
                let store = state.inner.store.lock().await;
                let Ok(mut statement)=store.prepare("select user_id,request_id,payload from agent_work_outbox where next_attempt_at<=unixepoch() order by next_attempt_at limit 20") else {continue};
                let Ok(rows) = statement.query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                }) else {
                    continue;
                };
                rows.filter_map(Result::ok).collect::<Vec<_>>()
            };
            for (user, request, payload) in pending {
                // Never upload a transcript with the currently selected account's credential.
                let Ok(token) = access_token_for_user(&state, &user).await else {
                    let _=state.inner.store.lock().await.execute("update agent_work_outbox set next_attempt_at=unixepoch()+60 where user_id=?1 and request_id=?2",rusqlite::params![user,request]);
                    continue;
                };
                let result = state
                    .inner
                    .http
                    .post(format!(
                        "{}/v1/agent-requests/{request}/events",
                        state.inner.server_url
                    ))
                    .bearer_auth(token)
                    .header("content-type", "application/json")
                    .body(payload)
                    .timeout(std::time::Duration::from_secs(15))
                    .send()
                    .await;
                if result.is_ok_and(|response| response.status().is_success()) {
                    let _ = state.inner.store.lock().await.execute(
                        "delete from agent_work_outbox where user_id=?1 and request_id=?2",
                        rusqlite::params![user, request],
                    );
                } else {
                    let _=state.inner.store.lock().await.execute("update agent_work_outbox set attempt_count=attempt_count+1,next_attempt_at=unixepoch()+min(60,(1 << min(attempt_count,6))) where user_id=?1 and request_id=?2",rusqlite::params![user,request]);
                }
            }
        }
    });
}
