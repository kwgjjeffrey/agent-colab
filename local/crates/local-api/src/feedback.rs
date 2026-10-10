//! Opt-in, hook-driven feedback. No Session discovery or polling is a capture source.
use super::*;
use rusqlite::OptionalExtension;
use serde_json::{Value, json};
mod capture;

pub(super) fn migrate(store: &rusqlite::Connection) -> anyhow::Result<()> {
    store.execute_batch("create table if not exists feedback_settings(user_id text primary key,enabled integer not null default 0,analysis_enabled integer not null default 0,consented_at text);create table if not exists feedback_observations(user_id text not null,session_id text not null,turn_id text not null,asset_key text not null,channel_key text not null,skill_version text not null,skill_name text not null default '',primary key(user_id,session_id,turn_id,asset_key));create table if not exists feedback_records(id text primary key,user_id text not null,asset_key text not null,channel_key text not null,turn_id text not null,session_id text not null,hook_json text not null,evidence_path text,metadata_json text,comment_markdown text,analysis_status text not null default 'pending',analysis_id text not null,uploaded integer not null default 0,comment_uploaded integer not null default 0,unique(user_id,session_id,turn_id,asset_key));")?;
    for (name, def) in [
        (
            "source_channel_key",
            "text not null default 'unknown:legacy-install'",
        ),
        ("generation", "integer not null default 0"),
    ] {
        let exists = store
            .prepare("pragma table_info(skill_installations)")?
            .query_map([], |r| r.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?
            .iter()
            .any(|n| n == name);
        if !exists {
            store.execute_batch(&format!(
                "alter table skill_installations add column {name} {def}"
            ))?;
        }
    }
    let names = store
        .prepare("pragma table_info(feedback_observations)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !names.iter().any(|name| name == "skill_name") {
        store.execute_batch(
            "alter table feedback_observations add column skill_name text not null default ''",
        )?;
    }
    Ok(())
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Settings {
    enabled: bool,
    analysis_enabled: bool,
    #[serde(default, skip_serializing)]
    consent_upload: bool,
}
async fn user_settings(s: &AppState, u: &str) -> Result<Settings, LocalError> {
    Ok(s.inner
        .store
        .lock()
        .await
        .query_row(
            "select enabled,analysis_enabled from feedback_settings where user_id=?1",
            [u],
            |r| {
                Ok(Settings {
                    enabled: r.get(0)?,
                    analysis_enabled: r.get(1)?,
                    consent_upload: false,
                })
            },
        )
        .optional()
        .map_err(LocalError::internal)?
        .unwrap_or(Settings {
            enabled: false,
            analysis_enabled: false,
            consent_upload: false,
        }))
}
pub(super) async fn settings(State(s): State<AppState>) -> Result<Json<Settings>, LocalError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "core.feedback.settings",
        async {
            let u = current_user_id(&s).await?;
            user_settings(&s, &u).await.map(Json)
        },
    )
    .await
}
pub(super) async fn configure(
    State(s): State<AppState>,
    Json(b): Json<Settings>,
) -> Result<Json<Settings>, LocalError> {
    colab_observability::registered_business(include_str!("../../../tracing/registry.json"),"core.feedback.configure",async {
    let u = current_user_id(&s).await?;
    if b.enabled && !b.consent_upload {
        return Err(LocalError::bad_request(
            "Explicit consent to upload task fragments is required",
        ));
    }
    s.inner.store.lock().await.execute("insert into feedback_settings(user_id,enabled,analysis_enabled,consented_at) values(?1,?2,?3,current_timestamp) on conflict(user_id) do update set enabled=excluded.enabled,analysis_enabled=excluded.analysis_enabled,consented_at=excluded.consented_at",rusqlite::params![u,b.enabled,b.analysis_enabled]).map_err(LocalError::internal)?;
    Ok(Json(b))

}).await
}
pub(super) async fn hook(
    State(s): State<AppState>,
    Json(mut e): Json<Value>,
) -> Result<Json<Value>, LocalError> {
    colab_observability::registered_business(include_str!("../../../tracing/registry.json"),"core.feedback.hook",async {
    let u = current_user_id(&s).await?;
    if !user_settings(&s, &u).await?.enabled {
        return Ok(Json(json!({})));
    }
    let session = e["session_id"]
        .as_str()
        .ok_or_else(|| LocalError::bad_request("Missing hook Session"))?
        .to_owned();
    let turn = e["turn_id"]
        .as_str()
        .ok_or_else(|| LocalError::bad_request("Missing hook turn"))?
        .to_owned();
    Uuid::parse_str(&session).map_err(LocalError::internal)?;
    Uuid::parse_str(&turn).map_err(LocalError::internal)?;
    match e["hook_event_name"].as_str() {
        Some("PostToolUse") => capture::observe(&s, &u, &session, &turn, &e).await?,
        Some("Stop") if e["stop_hook_active"] != true => {
            let path = capture::transcript_path(&e, &session)?;
            let extent = fs::metadata(&path).map_err(LocalError::internal)?.len();
            e["frozenExtent"] = json!(extent);
            e["capturedAt"] = json!(chrono::Utc::now().to_rfc3339());
            e["transcript_path"] = json!(path);
            let ids = {
                let store = s.inner.store.lock().await;
                let mut q=store.prepare("select asset_key,channel_key,skill_version,skill_name from feedback_observations where user_id=?1 and session_id=?2 and turn_id=?3").map_err(LocalError::internal)?;
                let observations = q
                    .query_map(rusqlite::params![u, session, turn], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, String>(3)?,
                        ))
                    })
                    .map_err(LocalError::internal)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(LocalError::internal)?;
                let mut ids = vec![];
                for (asset, channel, version, name) in observations {
                    let id = Uuid::new_v4().to_string();
                    let mut event = e.clone();
                    event["skillVersion"] = json!(version);
                    event["assetKey"] = json!(asset);
                    event["skillName"] = json!(name);
                    store.execute("insert or ignore into feedback_records(id,user_id,asset_key,channel_key,turn_id,session_id,hook_json,analysis_id) values(?1,?2,?3,?4,?5,?6,?7,?8)",rusqlite::params![id,u,asset,channel,turn,session,event.to_string(),Uuid::new_v4().to_string()]).map_err(LocalError::internal)?;
                    let actual:String=store.query_row("select id from feedback_records where user_id=?1 and session_id=?2 and turn_id=?3 and asset_key=?4",rusqlite::params![u,session,turn,asset],|r|r.get(0)).map_err(LocalError::internal)?;
                    ids.push(actual)
                }
                ids
            };
            for id in ids {
                files::enqueue_job(&s, "feedback_upload", &id, &u, 0).await?;
                files::enqueue_job(&s, "feedback_analyze", &id, &u, 0).await?;
            }
        }
        _ => {}
    }
    Ok(Json(json!({})))

}).await
}
async fn proxy(s: &AppState, path: &str, body: &Value) -> Result<Json<Value>, LocalError> {
    let token = access_token(s).await?;
    let response = s
        .inner
        .http
        .post(format!("{}{path}", s.inner.server_url))
        .bearer_auth(token)
        .json(body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}
pub(super) async fn list_assets(
    State(s): State<AppState>,
    Json(b): Json<Value>,
) -> Result<Json<Value>, LocalError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "core.feedback.list-assets",
        async { proxy(&s, "/v1/feedbacks/list-assets", &b).await },
    )
    .await
}
pub(super) async fn list_feedbacks(
    State(s): State<AppState>,
    Json(b): Json<Value>,
) -> Result<Json<Value>, LocalError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "core.feedback.list-feedbacks",
        async { proxy(&s, "/v1/feedbacks/list-feedbacks", &b).await },
    )
    .await
}
pub(super) async fn update_status(
    State(s): State<AppState>,
    Json(b): Json<Value>,
) -> Result<Json<Value>, LocalError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "core.feedback.update-status",
        async { proxy(&s, "/v1/feedbacks/update-status", &b).await },
    )
    .await
}
pub(super) fn start(s: &AppState) {
    for analysis in [false, true] {
        let s = s.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                if let Ok(Some(job)) = files::claim_feedback_job(&s, analysis).await {
                    let result = run_job(&s, &job.share_id, analysis).await;
                    files::finish_job(&s, &job, &result).await;
                }
            }
        });
    }
}
async fn run_job(s: &AppState, id: &str, analysis: bool) -> Result<(), LocalError> {
    let row:(String,String,String,String,Option<String>,Option<String>,String,String,bool,bool)=s.inner.store.lock().await.query_row("select user_id,asset_key,channel_key,hook_json,evidence_path,comment_markdown,analysis_status,analysis_id,uploaded,comment_uploaded from feedback_records where id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?,r.get(9)?))).map_err(LocalError::internal)?;
    let (u, asset, channel, event, path, comment, status, analysis_id, uploaded, comment_uploaded) =
        row;
    let settings = user_settings(s, &u).await?;
    if !settings.enabled {
        return Ok(());
    }
    let event: Value = serde_json::from_str(&event).map_err(LocalError::internal)?;
    let dir = s.inner.data_root.join("feedback").join(&u).join(id);
    let evidence = path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| dir.join("session.jsonl"));
    // Both jobs share one capture lock and an immutable evidence file.
    {
        let _lock = assets::publication_guard(s, "feedback", id).await;
        let captured: Option<String> = s
            .inner
            .store
            .lock()
            .await
            .query_row(
                "select evidence_path from feedback_records where id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(LocalError::internal)?;
        if captured.is_none() {
            let event = event.clone();
            let dir = dir.clone();
            let session = event["session_id"].as_str().unwrap_or("").to_owned();
            let (path, metadata) =
                tokio::task::spawn_blocking(move || capture::freeze(&event, &session, &dir))
                    .await
                    .map_err(LocalError::internal)??;
            s.inner
                .store
                .lock()
                .await
                .execute(
                    "update feedback_records set evidence_path=?2,metadata_json=?3 where id=?1",
                    rusqlite::params![id, path.to_string_lossy(), metadata.to_string()],
                )
                .map_err(LocalError::internal)?;
        }
    }
    if analysis {
        if status != "pending" {
            return Ok(());
        }
        let (status, comment) = if !settings.analysis_enabled {
            ("disabled", None)
        } else {
            match capture::analyze(s, &event, &evidence, &dir).await {
                Ok(text) => ("completed", Some(text)),
                Err(_) => ("failed", None),
            }
        };
        s.inner
            .store
            .lock()
            .await
            .execute(
                "update feedback_records set analysis_status=?2,comment_markdown=?3 where id=?1",
                rusqlite::params![id, status, comment],
            )
            .map_err(LocalError::internal)?;
        files::enqueue_job(s, "feedback_upload", id, &u, 0).await?;
        return Ok(());
    }
    let token = access_token_for_user(s, &u).await?;
    if !uploaded {
        let metadata: String = s
            .inner
            .store
            .lock()
            .await
            .query_row(
                "select metadata_json from feedback_records where id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(LocalError::internal)?;
        let body = json!({"assetKey":asset,"channelKey":channel,"skillVersion":event["skillVersion"],"consumerAgentType":"codex","capturedAt":event["capturedAt"],"metadata":serde_json::from_str::<Value>(&metadata).map_err(LocalError::internal)?});
        let response = s
            .inner
            .http
            .put(format!("{}/v1/feedbacks/{id}", s.inner.server_url))
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        use sha2::Digest;
        let bytes = tokio::fs::read(&evidence)
            .await
            .map_err(LocalError::internal)?;
        let digest = hex::encode(sha2::Sha256::digest(&bytes));
        let response = s
            .inner
            .http
            .put(format!(
                "{}/v1/feedbacks/{id}/session?digest={digest}",
                s.inner.server_url
            ))
            .bearer_auth(&token)
            .body(bytes)
            .send()
            .await
            .map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        s.inner
            .store
            .lock()
            .await
            .execute("update feedback_records set uploaded=1 where id=?1", [id])
            .map_err(LocalError::internal)?;
    }
    if status != "pending" && !comment_uploaded {
        let response=s.inner.http.put(format!("{}/v1/feedbacks/{id}/comment",s.inner.server_url)).bearer_auth(&token).json(&json!({"analysisStatus":status,"analysisId":analysis_id,"commentMarkdown":comment})).send().await.map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        s.inner
            .store
            .lock()
            .await
            .execute(
                "update feedback_records set comment_uploaded=1 where id=?1",
                [id],
            )
            .map_err(LocalError::internal)?;
    }
    Ok(())
}
pub(super) async fn read(
    State(s): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(b): Json<Value>,
) -> Result<Json<Value>, LocalError> {
    colab_observability::registered_business(include_str!("../../../tracing/registry.json"),"core.feedback.read",async {
    Uuid::parse_str(&id).map_err(|_| LocalError::bad_request("Invalid feedback ID"))?;
    let u = current_user_id(&s).await?;
    let token = access_token_for_user(&s, &u).await?;
    // Reauthorize every read before using the private cache; explicit denial wins over cache.
    let response = s
        .inner
        .http
        .get(format!("{}/v1/feedbacks/{id}/session", s.inner.server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let expected_digest=response.headers().get("x-colab-sha256").and_then(|v|v.to_str().ok()).ok_or_else(||LocalError::internal("Missing feedback digest"))?.to_owned();
    let expected_size=response.headers().get("x-colab-byte-size").and_then(|v|v.to_str().ok()).and_then(|s|s.parse::<usize>().ok()).filter(|n|*n<=4*1024*1024).ok_or_else(||LocalError::internal("Invalid feedback size"))?;
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut raw = vec![];
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(LocalError::internal)?;
        if raw.len() + chunk.len() > 4 * 1024 * 1024 {
            return Err(LocalError::bad_request("Feedback evidence exceeds limit"));
        }
        raw.extend_from_slice(&chunk)
    }
    use sha2::Digest;
    if raw.len()!=expected_size||hex::encode(sha2::Sha256::digest(&raw))!=expected_digest{return Err(LocalError::internal("Feedback evidence failed integrity verification"));}
    let rows = std::str::from_utf8(&raw)
        .map_err(LocalError::internal)?
        .lines()
        .enumerate()
        .map(|(i, line)| serde_json::from_str::<Value>(line).map(|v| (i, v)))
        .collect::<Result<Vec<_>, _>>()
        .map_err(LocalError::internal)?;
    let turns = sessions::project_codex_rows(
        rows.into_iter(),
        b["includeOutputs"].as_bool().unwrap_or(false),
        b["maxOutputCharsPerItem"]
            .as_u64()
            .unwrap_or(4000)
            .clamp(1, 100000) as usize,
    );
    let start = if let Some(cursor) = b["cursor"].as_str() {
        let parts: Vec<_> = cursor.split(':').collect();
        if parts.len() != 2 || parts[0] != id {
            return Err(LocalError::bad_request("Invalid feedback cursor"));
        }
        parts[1].parse::<usize>().map_err(LocalError::internal)?
    } else {
        0
    };
    let end =
        (start + b["turnLimit"].as_u64().unwrap_or(20).clamp(1, 100) as usize).min(turns.len());
    if start > end {
        return Err(LocalError::bad_request("Invalid feedback cursor"));
    }
    Ok(Json(
        json!({"schemaVersion":1,"session":{"id":id,"title":"Skill feedback","provider":"codex"},"snapshot":{"id":id},"turns":&turns[start..end],"page":{"hasMore":end<turns.len(),"nextCursor":if end<turns.len(){Some(format!("{id}:{end}"))}else{None}},"freshness":{"cache":"committed"},"warnings":[]}),
    ))

}).await
}
#[cfg(test)]
mod tests {
    use super::*;
    fn state() -> (AppState, PathBuf) {
        let root = std::env::temp_dir().join(format!("colab-feedback-state-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let credentials = root.join("google.json");
        fs::write(&credentials,br#"{"installed":{"client_id":"test","client_secret":"test","auth_uri":"http://localhost","token_uri":"http://localhost","redirect_uris":["http://localhost"]}}"#).unwrap();
        let s = AppState::load(
            &credentials,
            root.join("client.sqlite3"),
            "http://localhost/callback".into(),
            "http://localhost".into(),
        )
        .unwrap();
        (s, root)
    }
    #[tokio::test]
    async fn disabled_hook_never_reads_transcript_or_queues_work() {
        let (s, root) = state();
        let session = ColabSession {
            access_token: "test".into(),
            refresh_token: "test".into(),
            expires_in: 3600,
            expires_at: i64::MAX,
            user: User {
                id: "reporter".into(),
                email: "reporter@test.invalid".into(),
                display_name: None,
                avatar_url: None,
            },
        };
        auth::save_account(&s, &session).await.unwrap();
        *s.inner.session.lock().await = Some(session);
        assert!(
            hook(
                State(s.clone()),
                Json(json!({"hook_event_name":"Stop","transcript_path":"/not/a/file"}))
            )
            .await
            .is_ok()
        );
        assert_eq!(
            s.inner
                .store
                .lock()
                .await
                .query_row("select count(*) from local_jobs", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert!(
            configure(
                State(s.clone()),
                Json(Settings {
                    enabled: true,
                    analysis_enabled: false,
                    consent_upload: false
                })
            )
            .await
            .is_err()
        );
        drop(s);
        fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn native_managed_read_records_asset_channel_and_version() {
        let (s, root) = state();
        let installed = root.join("managed");
        fs::create_dir_all(&installed).unwrap();
        fs::write(installed.join("SKILL.md"), "---\nname: trial\n---\n").unwrap();
        s.inner.store.lock().await.execute("insert into skill_installations(share_id,user_id,target_agent,installed_path,installed_root_oid,content_hash,source_channel_key) values('asset-id','user','codex',?1,'version-one','hash','channel:source')",[installed.to_string_lossy().as_ref()]).unwrap();
        capture::observe(
            &s,
            "user",
            "session",
            "turn",
            &json!({"tool_name":"Read","tool_input":{"file_path":installed.join("SKILL.md")}}),
        )
        .await
        .unwrap();
        let row: (String, String, String) = s
            .inner
            .store
            .lock()
            .await
            .query_row(
                "select asset_key,channel_key,skill_version,skill_name from feedback_observations",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            row,
            (
                "asset:asset-id".into(),
                "channel:source".into(),
                "version-one".into()
            )
        );
        drop(s);
        fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn comment_arriving_during_upload_keeps_the_job_pending() {
        let (s, root) = state();
        files::enqueue_job(&s, "feedback_upload", "feedback", "reporter", 0)
            .await
            .unwrap();
        let job = files::claim_feedback_job(&s, false).await.unwrap().unwrap();
        files::enqueue_job(&s, "feedback_upload", "feedback", "reporter", 0)
            .await
            .unwrap();
        files::finish_job(&s, &job, &Ok(())).await;
        let state: String = s
            .inner
            .store
            .lock()
            .await
            .query_row("select state from local_jobs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(state, "pending");
        drop(s);
        fs::remove_dir_all(root).unwrap();
    }
}

pub(super) async fn list_access(State(s):State<AppState>,Json(b):Json<Value>)->Result<Json<Value>,LocalError>{colab_observability::registered_business(include_str!("../../../tracing/registry.json"),"core.feedback.list-feedback-access",async {proxy(&s,"/v1/feedbacks/list-feedback-access",&b).await}).await}
pub(super) async fn update_access(State(s):State<AppState>,Json(b):Json<Value>)->Result<Json<Value>,LocalError>{colab_observability::registered_business(include_str!("../../../tracing/registry.json"),"core.feedback.update-feedback-access",async {proxy(&s,"/v1/feedbacks/update-feedback-access",&b).await}).await}
