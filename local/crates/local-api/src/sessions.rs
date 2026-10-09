//! Session shared-item adapter.
//!
//! Three positions are deliberately independent: `last_byte_offset` is the contributor-side
//! source cursor, `snapshot_id` pins an immutable remote/cache view, and the opaque read cursor
//! only paginates normalized turns inside that snapshot.  Raw provider JSONL is never rewritten
//! on upload; adapters project it only when a consumer reads.

use super::*;
use axum::extract::{Query, State};
use rusqlite::OptionalExtension;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
mod native_titles;
mod chunk_cache;
mod read_index;

const SESSION_SEGMENT_TARGET_BYTES: usize = 8 * 1024 * 1024;
const SESSION_RECORD_MAX_BYTES: usize = 32 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SessionSource {
    id: String,
    thread_id: String,
    name: String,
    coding_agent: String,
    source_adapter: String,
    source_path: String,
    updated_at: i64,
}

#[derive(Deserialize)]
pub(super) struct SessionSourceQuery {
    q: Option<String>,
    limit: Option<usize>,
}

#[derive(Clone)]
struct CatalogEntry {
    catalog_id: String,
    provider: String,
    thread_id: String,
    name: String,
    source_path: String,
    source_adapter: String,
    size_bytes: i64,
    mtime_ns: i64,
    updated_at: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ShareSession {
    source_path: String,
    source_adapter: String,
    name: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReadSession {
    cursor: Option<String>,
    turn_limit: Option<usize>,
    include_outputs: Option<bool>,
    max_output_chars_per_item: Option<usize>,
}

pub(super) fn start_session_sync(state: &AppState) {
    start_session_catalog(state);
    let state = state.clone();
    tokio::spawn(async move {
        // Agent transcripts can append several records per second. A one-minute continuous-sync
        // window coalesces writes. Preview never awaits or owns this publication job.
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            tick.tick().await;
            let rows = {
                let store = state.inner.store.lock().await;
                let Ok(mut stmt)=store.prepare("select share_id,trace_context from local_session_sources where user_id=(select value from local_settings where key='current_user_id')") else {continue};
                stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)))
                    .map(|it| it.filter_map(Result::ok).collect::<Vec<_>>())
                    .unwrap_or_default()
            };
            for (id, envelope) in rows {
                let _ = sync_initial_source(&state, &id, envelope).await;
            }
        }
    });
}

// The original share trace is retained only until first successful publication. Later transcript
// updates are independent background work, not forever children of the original share action.
async fn sync_initial_source(state: &AppState, id: &str, envelope: Option<String>) -> Result<(), LocalError> {
    let canonical_id = assets::local_id(state,id).await?;
    let id = canonical_id.as_str();
    if !assets::enabled(state,id).await? { return Ok(()); }
    let context=envelope.as_deref().and_then(|raw|serde_json::from_str(raw).ok()).unwrap_or_default();
    let result=colab_observability::resume(&context,sync_source(state,id)).await;
    record_sync_state(state, id, if result.is_ok() { "synced" } else { "failed" }, result.as_ref().err().map(|error| error.message.as_str())).await?;
    if result.is_ok() && envelope.is_some() {
        state.inner.store.lock().await.execute("update local_session_sources set trace_context=null where share_id=?1 and trace_context=?2",rusqlite::params![id,envelope]).map_err(LocalError::internal)?;
    }
    result
}

pub(super) async fn list_session_sources(
    State(state): State<AppState>,
    Query(query): Query<SessionSourceQuery>,
) -> Result<Json<Vec<SessionSource>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.list-session-sources", async {

    let search = query.q.unwrap_or_default();
    let pattern = format!("%{}%", search.to_lowercase());
    let limit = query.limit.unwrap_or(200).clamp(1, 500) as i64;
    let store = state.inner.store.lock().await;
    // The Agent share command accepts the catalog id and exact source path returned by this
    // endpoint. They must therefore participate in the same lookup as human-facing title/thread.
    let mut statement = store.prepare("select catalog_id,thread_id,name,provider,source_adapter,source_path,updated_at from local_session_catalog where ?1='' or lower(name) like ?2 or lower(thread_id) like ?2 or lower(catalog_id) like ?2 or lower(source_path) like ?2 order by updated_at desc,thread_id desc limit ?3").map_err(LocalError::internal)?;
    let rows = statement
        .query_map(rusqlite::params![search, pattern, limit], |row| {
            let thread_id: String = row.get(1)?;
            Ok(SessionSource {
                id: row.get(0)?,
                thread_id,
                name: row.get(2)?,
                coding_agent: row.get(3)?,
                source_adapter: row.get(4)?,
                source_path: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(LocalError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(LocalError::internal)?;
    Ok(Json(rows))

}).await
}

async fn record_sync_state(state: &AppState, id: &str, status: &str, error: Option<&str>) -> Result<(), LocalError> {
    let user = current_user_id(state).await?;
    let value = json!({"state":status,"error":error}).to_string();
    state.inner.store.lock().await.execute("insert into local_settings(key,value) values(?1,?2) on conflict(key) do update set value=excluded.value", rusqlite::params![format!("session_sync:{user}:{id}"),value]).map_err(LocalError::internal)?;
    Ok(())
}

/// Reads progress only; polling cannot start, cancel or wait on a publication job.
pub(super) async fn session_sync_status(State(state): State<AppState>, AxumPath(id): AxumPath<String>) -> Result<Json<Value>, LocalError> {
    let id = assets::local_id(&state,&id).await?;
    let user = current_user_id(&state).await?;
    let store = state.inner.store.lock().await;
    let source: Option<(String,i64)> = store.query_row("select source_path,last_byte_offset from local_session_sources where share_id=?1 and user_id=?2",rusqlite::params![id,user],|row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(LocalError::internal)?;
    let Some((path, uploaded)) = source else {
        let raw: Option<String> = store.query_row("select value from local_settings where key=?1",[format!("session_sync:{user}:{id}")],|row|row.get(0)).optional().map_err(LocalError::internal)?;
        let mut status: Value = raw.and_then(|raw|serde_json::from_str(&raw).ok()).unwrap_or(json!({"state":"unknown"}));
        status["contributor"] = json!(false);
        return Ok(Json(status));
    };
    let total = fs::metadata(path).map(|file|file.len()).unwrap_or(uploaded.max(0) as u64);
    let raw: Option<String> = store.query_row("select value from local_settings where key=?1",[format!("session_sync:{user}:{id}")],|row|row.get(0)).optional().map_err(LocalError::internal)?;
    let mut status: Value = raw.and_then(|raw|serde_json::from_str(&raw).ok()).unwrap_or(json!({"state":"pending"}));
    if status["state"] == "synced" && (uploaded.max(0) as u64) != total { status["state"] = json!("pending"); }
    status["uploadedBytes"] = json!(uploaded.max(0)); status["totalBytes"] = json!(total); status["contributor"] = json!(true);
    Ok(Json(status))
}

/// Maintain a disposable metadata index independently of listing requests. A refresh stats every
/// transcript but parses only files whose size or mtime changed; the original JSONL remains the
/// source of truth and is never copied into SQLite.
fn start_session_catalog(state: &AppState) {
    let state = state.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            tick.tick().await;
            if let Err(error) = refresh_session_catalog(&state).await {
                eprintln!("Session catalog refresh failed: {}", error.message);
            }
        }
    });
}

async fn refresh_session_catalog(state: &AppState) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.refresh-session-catalog", async {

    let known = {
        let store = state.inner.store.lock().await;
        let mut statement = store.prepare("select catalog_id,provider,source_path,thread_id,name,source_adapter,size_bytes,mtime_ns,updated_at from local_session_catalog").map_err(LocalError::internal)?;
        statement
            .query_map([], |row| {
                Ok((
                    (row.get::<_, String>(1)?, row.get::<_, String>(2)?),
                    CatalogEntry {
                        catalog_id: row.get(0)?,
                        provider: row.get(1)?,
                        source_path: row.get(2)?,
                        thread_id: row.get(3)?,
                        name: row.get(4)?,
                        source_adapter: row.get(5)?,
                        size_bytes: row.get(6)?,
                        mtime_ns: row.get(7)?,
                        updated_at: row.get(8)?,
                    },
                ))
            })
            .map_err(LocalError::internal)?
            .filter_map(Result::ok)
            .collect::<HashMap<_, _>>()
    };
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let (seen, changed) =
        tokio::task::spawn_blocking(move || discover_session_catalog(home.as_deref(), &known))
            .await
            .map_err(LocalError::internal)?;
    let mut store = state.inner.store.lock().await;
    let transaction = store.transaction().map_err(LocalError::internal)?;
    for entry in changed {
        transaction.execute("insert into local_session_catalog(catalog_id,provider,thread_id,name,source_path,source_adapter,size_bytes,mtime_ns,updated_at) values(?1,?2,?3,?4,?5,?6,?7,?8,?9) on conflict(catalog_id) do update set thread_id=excluded.thread_id,name=excluded.name,source_path=excluded.source_path,source_adapter=excluded.source_adapter,size_bytes=excluded.size_bytes,mtime_ns=excluded.mtime_ns,updated_at=excluded.updated_at",rusqlite::params![entry.catalog_id,entry.provider,entry.thread_id,entry.name,entry.source_path,entry.source_adapter,entry.size_bytes,entry.mtime_ns,entry.updated_at]).map_err(LocalError::internal)?;
    }
    let existing = transaction
        .prepare("select provider,source_path from local_session_catalog")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(LocalError::internal)?;
    for (provider, path) in existing {
        if !seen.contains(&(provider.clone(), path.clone())) {
            transaction
                .execute(
                    "delete from local_session_catalog where provider=?1 and source_path=?2",
                    [provider, path],
                )
                .map_err(LocalError::internal)?;
        }
    }
    transaction.commit().map_err(LocalError::internal)?;
    Ok(())

}).await
}

fn discover_session_catalog(
    home: Option<&Path>,
    known: &HashMap<(String, String), CatalogEntry>,
) -> (HashSet<(String, String)>, Vec<CatalogEntry>) {
    let mut seen = HashSet::new();
    let mut changed = Vec::new();
    let Some(home) = home else {
        return (seen, changed);
    };
    scan_jsonl(
        &home.join(".codex/sessions"),
        "codex",
        "codex-jsonl-v1",
        6,
        known,
        &mut seen,
        &mut changed,
    );
    scan_jsonl(
        &home.join(".myflicker/projects"),
        "myflicker",
        "myflicker-jsonl-v1",
        2,
        known,
        &mut seen,
        &mut changed,
    );
    scan_jsonl(
        &home.join(".codeflicker/projects"),
        "myflicker",
        "myflicker-jsonl-v1",
        2,
        known,
        &mut seen,
        &mut changed,
    );
    scan_jsonl(
        &home.join(".myflicker/sessions"),
        "myflicker",
        "myflicker-desktop-jsonl-v1",
        4,
        known,
        &mut seen,
        &mut changed,
    );
    scan_jsonl(
        &home.join(".claude/projects"),
        "claude-code",
        "claude-jsonl-v1",
        3,
        known,
        &mut seen,
        &mut changed,
    );
    // A client rename can change its metadata database without touching the transcript.
    let titles = native_titles::codex_titles(home);
    for entry in &mut changed {
        if entry.provider == "codex" {
            if let Some(title) = titles.get(&entry.source_path) { entry.name = title.clone(); }
        }
    }
    for (key, old) in known {
        if old.provider == "codex" && seen.contains(key) {
            if let Some(title) = titles.get(&old.source_path) {
                if title != &old.name && !changed.iter().any(|entry| entry.catalog_id == old.catalog_id) {
                    let mut renamed = old.clone();
                    renamed.name = title.clone();
                    changed.push(renamed);
                }
            }
        }
    }
    (seen, changed)
}

fn scan_jsonl(
    root: &Path,
    provider: &str,
    adapter: &str,
    depth: usize,
    known: &HashMap<(String, String), CatalogEntry>,
    seen: &mut HashSet<(String, String)>,
    changed: &mut Vec<CatalogEntry>,
) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_jsonl(&path, provider, adapter, depth - 1, known, seen, changed)
        } else if path.extension().and_then(|x| x.to_str()) == Some("jsonl") {
            if adapter == "myflicker-desktop-jsonl-v1"
                && (path.file_name().and_then(|x| x.to_str()) != Some("cache.jsonl")
                    || path
                        .parent()
                        .and_then(|x| x.file_name())
                        .and_then(|x| x.to_str())
                        != Some("message"))
            {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            let updated_at = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or_default();
            let mtime_ns = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_nanos().min(i64::MAX as u128) as i64)
                .unwrap_or_default();
            let source_path = path.to_string_lossy().into_owned();
            let key = (provider.to_owned(), source_path.clone());
            seen.insert(key.clone());
            if known.get(&key).is_some_and(|old| {
                old.size_bytes == metadata.len() as i64 && old.mtime_ns == mtime_ns
            }) {
                continue;
            }
            let id = if adapter == "myflicker-desktop-jsonl-v1" {
                path.parent()
                    .and_then(Path::parent)
                    .and_then(Path::file_name)
            } else {
                path.file_stem()
            }
            .and_then(|x| x.to_str())
            .unwrap_or("session")
            .to_string();
            let digest = Sha256::digest(format!("{provider}\0{source_path}"));
            let catalog_id = digest[..12]
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect();
            changed.push(CatalogEntry {
                catalog_id,
                provider: provider.into(),
                thread_id: id.clone(),
                name: session_title(&path).unwrap_or(id),
                source_adapter: adapter.into(),
                source_path,
                size_bytes: metadata.len() as i64,
                mtime_ns,
                updated_at,
            });
        }
    }
}
fn session_title(path: &Path) -> Option<String> {
    if path.components().any(|part| part.as_os_str() == ".claude") {
        let file = fs::File::open(path).ok()?;
        let mut custom = None;
        let mut summary = None;
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            // Skip conversation bodies; only provider title records participate.
            if !line.contains("\"custom-title\"") && !line.contains("\"summary\"") { continue; }
            let Ok(record) = serde_json::from_str::<Value>(&line) else { continue };
            let target = match record["type"].as_str() {
                Some("custom-title") => Some((&mut custom, "customTitle")),
                Some("summary") => Some((&mut summary, "summary")),
                _ => None,
            };
            if let Some((target, field)) = target {
                if let Some(title) = record[field].as_str().filter(|title| !title.trim().is_empty()) {
                    *target = Some(title.to_owned());
                }
            }
        }
        if let Some(title) = custom.or(summary) { return Some(title); }
    }
    let file = fs::File::open(path).ok()?;
    for line in BufReader::new(file).lines().take(80) {
        let line = line.ok()?;
        let v: Value = serde_json::from_str(&line).ok()?;
        if let Some(s) = extract_user_text(&v) {
            let s = s.trim();
            // Codex session files can begin with injected environment/plugin envelopes represented
            // as user-role records. They remain in the raw transcript but are not useful titles.
            if !s.is_empty()
                && !s.starts_with("<recommended_plugins>")
                && !s.starts_with("<environment_context>")
                && !s.starts_with("<app-context>")
            {
                return Some(s.chars().take(80).collect());
            }
        }
    }
    None
}

pub(super) async fn list_session_shares(
    State(state): State<AppState>,
    AxumPath(channel_id): AxumPath<String>,
) -> Result<Json<Vec<SessionShare>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.list-session-shares", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/channels/{channel_id}/sessions",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let rows: Vec<SessionShare> = response.json().await.map_err(LocalError::internal)?;
    let store = state.inner.store.lock().await;
    for r in &rows {
        store.execute("insert into session_share_cache(share_id,name,source_adapter,contributor_name,contributor_avatar_url,remote_updated_at) values(?1,?2,?3,?4,?5,?6) on conflict(share_id) do update set name=excluded.name,source_adapter=excluded.source_adapter,contributor_name=excluded.contributor_name,contributor_avatar_url=excluded.contributor_avatar_url,remote_updated_at=excluded.remote_updated_at,updated_at=current_timestamp",rusqlite::params![r.id,r.name,r.source_adapter,r.contributor_name,r.contributor_avatar_url,r.updated_at]).map_err(LocalError::internal)?;
    }
    Ok(Json(rows))

}).await
}

pub(super) async fn share_session(
    State(state): State<AppState>,
    AxumPath(channel_id): AxumPath<String>,
    Json(body): Json<ShareSession>,
) -> Result<(StatusCode, Json<SessionShare>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.share-session", async {

    let path = fs::canonicalize(&body.source_path).map_err(LocalError::internal)?;
    if !path.is_file() {
        return Err(LocalError::bad_request("Session source must be a file"));
    }
    if !matches!(
        body.source_adapter.as_str(),
        "codex-jsonl-v1" | "myflicker-jsonl-v1" | "myflicker-desktop-jsonl-v1" | "claude-jsonl-v1"
    ) {
        return Err(LocalError::bad_request("Unsupported Session adapter"));
    }
    let name = body
        .name
        .filter(|x| !x.trim().is_empty())
        .or_else(|| {
            let home = std::env::var_os("HOME").map(PathBuf::from)?;
            native_titles::codex_titles(&home).remove(&path.to_string_lossy().into_owned())
        })
        .or_else(|| session_title(&path))
        .unwrap_or_else(|| {
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into()
        });
    let binding = assets::register(&state, &channel_id, "session", &path, &name, None, &body.source_adapter).await?;
    let share = list_session_shares(State(state.clone()), AxumPath(channel_id.clone())).await?.0
        .into_iter().find(|share|share.id==binding.reference_id)
        .ok_or_else(||LocalError::bad_request("Registered Session reference was not returned"))?;
    let user = current_user_id(&state).await?;
    let trace_context = colab_observability::context_json();
    {
        let store = state.inner.store.lock().await;
        store.execute("insert into local_session_sources(share_id,channel_id,user_id,source_path,source_adapter,source_thread_id,trace_context) values(?1,?2,?3,?4,?5,?6,?7) on conflict(share_id) do nothing",rusqlite::params![binding.publication_id,channel_id,user,path.to_string_lossy(),body.source_adapter,path.file_stem().and_then(|x|x.to_str()), if trace_context.is_null(){None}else{Some(trace_context.to_string())}]).map_err(LocalError::internal)?;
    }
    // Registration is accepted immediately. Initial publication uses the same background path as
    // later increments so a large existing transcript never makes the GUI guess whether a timed
    // out request actually created the share.
    let sync_state = state.clone();
    let sync_share_id = binding.publication_id;
    tokio::spawn(async move {
        if let Err(error) = sync_initial_source(&sync_state, &sync_share_id, if trace_context.is_null(){None}else{Some(trace_context.to_string())}).await {
            eprintln!("Initial Session synchronization failed: {}", error.message);
        }
    });
    Ok((StatusCode::CREATED, Json(share)))

}).await
}

pub(super) async fn sync_session(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<Json<Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.sync-session", async {

    sync_initial_source(&state, &share_id, None).await?;
    let user = current_user_id(&state).await?;
    let publication_id=assets::local_id(&state,&share_id).await?;
    let local: Option<String> = state.inner.store.lock().await.query_row(
        "select source_path from local_session_sources where share_id=?1 and user_id=?2",
        rusqlite::params![publication_id,user],|row|row.get(0)).optional().map_err(LocalError::internal)?;
    if let Some(path) = local.filter(|path|Path::new(path).is_file()) {
        return Ok(Json(json!({"shareId":share_id,"rawPath":path,"syncState":"synced"})));
    }
    let path = materialize(&state, &share_id).await?;
    Ok(Json(json!({"shareId":share_id,"rawPath":path})))

}).await
}

async fn sync_source(state: &AppState, share_id: &str) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.sync-source", async {

    let sync_lock = {
        let mut locks = state.inner.session_sync_locks.lock().await;
        Arc::clone(
            locks
                .entry(share_id.to_owned())
                .or_insert_with(|| Arc::new(Mutex::new(()))),
        )
    };
    // Snapshot append uses compare-and-swap. Read the durable local cursor only after acquiring
    // this share-specific lock so concurrent background/manual callers cannot reuse one parent.
    let _sync_guard = sync_lock.lock().await;
    let user = current_user_id(state).await?;
    let source = {
        let store = state.inner.store.lock().await;
        store.query_row(
            "select source_path,last_byte_offset,last_snapshot_id from local_session_sources where share_id=?1 and user_id=?2",
            rusqlite::params![share_id, user],
            |r| Ok((PathBuf::from(r.get::<_, String>(0)?), r.get::<_, i64>(1)?, r.get::<_, Option<String>>(2)?)),
        )
        .optional()
        .map_err(LocalError::internal)?
    };
    // A consumer can materialize another member's Session but must never upload from a
    // contributor source path merely because both accounts have used this device.
    let Some((path, offset, mut parent)) = source else {
        return Ok(());
    };
    record_sync_state(state, share_id, "syncing", None).await?;
    let length = match fs::metadata(&path) {
        Ok(metadata) => metadata.len() as i64,
        // The immutable published snapshot remains readable after its source is moved/deleted.
        // Do not turn a missing local contribution path into a failed consumer read.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(LocalError::internal(error)),
    };
    let reset_chain = length < offset;
    let start = if reset_chain { 0 } else { offset };
    if length == start {
        return publish_read_index(state,share_id,&path,parent.as_deref(),start as u64).await;
    }
    let mut file = fs::File::open(&path).map_err(LocalError::internal)?;
    file.seek(SeekFrom::Start(start as u64))
        .map_err(LocalError::internal)?;
    let token = access_token(state).await?;
    let negotiation = state.inner.http.get(format!("{}/v1/sessions/{share_id}/segments?encoded=true",state.inner.server_url))
        .bearer_auth(&token).send().await.map_err(LocalError::internal)?;
    if !negotiation.status().is_success() {return Err(remote_error(negotiation).await)}
    let supports_chunks = negotiation.json::<Value>().await.map_err(LocalError::internal)?["chunkProtocol"].as_u64().is_some_and(|version|version>=1);
    // Freeze the readable extent for this pass. Concurrent appends are intentionally left for
    // the next pass, which prevents a busy transcript from making synchronization unbounded.
    let mut reader = BufReader::new(file.take((length - start) as u64));
    let mut published = start;
    let mut first_segment = true;
    while let Some(bytes) = read_session_segment(&mut reader)? {
        let next = published + bytes.len() as i64;
        let (chunk, bytes) = if supports_chunks {
            let (metadata,encoded)=tokio::task::spawn_blocking(move || colab_local_core::session_chunks::encode(String::new(),&bytes))
                .await.map_err(LocalError::internal)?.map_err(LocalError::internal)?;
            (Some(metadata),encoded)
        } else {(None,bytes)};
        let digest = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let cursor = json!({"byteOffset":next,"sourceSize":length}).to_string();
        let mut request = state
            .inner
            .http
            .post(format!(
                "{}/v1/sessions/{share_id}/segments",
                state.inner.server_url
            ))
            .bearer_auth(&token)
            .query(&[
                ("sourceCursor", cursor.as_str()),
                ("digest", digest.as_str()),
                (
                    "resetChain",
                    if reset_chain && first_segment {
                        "true"
                    } else {
                        "false"
                    },
                ),
            ]);
        if let Some(ref snapshot) = parent {
            request = request.query(&[("parentSnapshotId", snapshot)])
        }
        if let Some(metadata)=&chunk {
            request=request.query(&[("codec","zstd"),("decodedByteSize",&metadata.decoded_bytes.to_string()),("decodedDigest",metadata.decoded_digest.as_str())]);
        }
        // One immutable encoded block is held until ACK. Never reopen a mutable source
        // range after hashing: rewritten source bytes cannot change this upload body.
        let size = bytes.len() as u64;
        let response = request
            .timeout(std::time::Duration::from_secs(15 * 60))
            .header(reqwest::header::CONTENT_LENGTH, size)
            .body(bytes)
            .send()
            .await
            .map_err(LocalError::internal)?;
        let value: Value = if response.status() == StatusCode::CONFLICT {
            // The Server may commit an append whose acknowledgement is lost on restart.
            // Adopt only that exact segment, never an arbitrary newer remote cursor.
            let probe = state.inner.http.get(format!("{}/v1/sessions/{share_id}/segments?encoded=true",state.inner.server_url))
                .bearer_auth(&token).send().await.map_err(LocalError::internal)?;
            let recovered = if probe.status().is_success() {
                let value=probe.json::<Value>().await.map_err(LocalError::internal)?;
                let codec_matches=chunk.as_ref().is_none_or(|metadata|value["segments"].as_array().and_then(|segments|segments.last()).is_some_and(|segment|
                    segment["codec"]=="zstd" && segment["decodedByteSize"].as_u64()==Some(metadata.decoded_bytes)
                    && segment["decodedDigest"].as_str()==Some(metadata.decoded_digest.as_str())));
                if codec_matches {acknowledged_append(&value,parent.as_deref(),reset_chain && first_segment,next,&digest,size)} else {None}
            } else { None };
            let Some(snapshot)=recovered else { return Err(remote_error(response).await); };
            json!({"snapshot":{"id":snapshot}})
        } else {
            if !response.status().is_success() { return Err(remote_error(response).await); }
            response.json().await.map_err(LocalError::internal)?
        };
        let snapshot = value["snapshot"]["id"]
            .as_str()
            .ok_or_else(|| LocalError::internal("Server omitted Session snapshot id"))?
            .to_owned();
        {
            // Commit progress after every accepted segment. A network failure therefore resumes
            // from the last durable JSONL boundary instead of replaying a giant initial upload.
            let store = state.inner.store.lock().await;
            store.execute(
                "update local_session_sources set last_byte_offset=?3,last_snapshot_id=?4,updated_at=current_timestamp where share_id=?1 and user_id=?2",
                rusqlite::params![share_id, user, next, &snapshot],
            ).map_err(LocalError::internal)?;
        }
        published = next;
        parent = Some(snapshot);
        first_segment = false;
        // Publish readable progress independently. Index failure cannot revoke an accepted
        // block or stop later blocks; the final durable job retries any missing latest index.
        if let Err(error)=publish_read_index(state,share_id,&path,parent.as_deref(),published as u64).await {
            eprintln!("Session read index pending; continuing byte synchronization: {}",error.message);
        }
    }
    publish_read_index(state,share_id,&path,parent.as_deref(),published as u64).await

}).await
}

/// Build a bounded segment without ever splitting one provider JSONL record.
fn read_session_segment(reader: &mut impl BufRead) -> Result<Option<Vec<u8>>, LocalError> {
    let mut segment = Vec::with_capacity(SESSION_SEGMENT_TARGET_BYTES);
    loop {
        let mut record = Vec::new();
        let count = reader
            .read_until(b'\n', &mut record)
            .map_err(LocalError::internal)?;
        if count == 0 {
            break;
        }
        if record.last() != Some(&b'\n') {
            // Provider is still flushing this record. The cursor is advanced only for complete
            // records, so this tail is naturally retried on the next synchronization pass.
            break;
        }
        if record.len() > SESSION_RECORD_MAX_BYTES {
            return Err(LocalError::bad_request(format!(
                "Session contains a JSONL record larger than {} MiB",
                SESSION_RECORD_MAX_BYTES / 1024 / 1024
            )));
        }
        segment.extend_from_slice(&record);
        if segment.len() >= SESSION_SEGMENT_TARGET_BYTES {
            break;
        }
    }
    Ok((!segment.is_empty()).then_some(segment))
}

async fn publish_read_index(state:&AppState,share_id:&str,source:&Path,snapshot:Option<&str>,extent:u64)->Result<(),LocalError> {
    let Some(snapshot)=snapshot else {return Ok(())};
    let user=current_user_id(state).await?;let token=access_token_for_user(state,&user).await?;
    let response=state.inner.http.get(format!("{}/v1/sessions/{share_id}/segments?encoded=true",state.inner.server_url)).bearer_auth(&token).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() {return Err(remote_error(response).await)}
    let metadata=response.json::<Value>().await.map_err(LocalError::internal)?;
    if metadata["chunkProtocol"].as_u64().is_none_or(|version|version<2) {return Ok(())}
    if metadata["snapshot"]["id"].as_str()!=Some(snapshot) {return Err(LocalError::internal("Session index snapshot changed"))}
    if !metadata["readIndex"].is_null() {return Ok(())}
    let adapter:String=state.inner.store.lock().await.query_row("select source_adapter from local_session_sources where share_id=?1 and user_id=?2",[share_id,&user],|row|row.get(0)).map_err(LocalError::internal)?;
    let dir=state.inner.data_root.join("session-previews").join(&user).join(share_id);fs::create_dir_all(&dir).map_err(LocalError::internal)?;
    let view=dir.join(format!("{snapshot}.view"));let source=source.to_path_buf();
    let (chunk,encoded)=tokio::task::spawn_blocking(move ||->Result<_,LocalError> {
        read_index::freeze_extent(&source,&view,Some(extent))?;
        let bytes=read_index::bundle(&view,&adapter)?;
        read_index::install(&view,&bytes,extent)?;
        if let Some(dir)=view.parent() {read_index::prune_views(dir,&view);}
        colab_local_core::session_chunks::encode(String::new(),&bytes).map_err(LocalError::internal)
    }).await.map_err(LocalError::internal)??;
    let response=state.inner.http.post(format!("{}/v1/sessions/{share_id}/read-index",state.inner.server_url))
        .bearer_auth(&token).query(&[("snapshotId",snapshot),("digest",chunk.encoded_digest.as_str()),("decodedDigest",chunk.decoded_digest.as_str()),("decodedByteSize",&chunk.decoded_bytes.to_string())])
        .timeout(std::time::Duration::from_secs(15*60)).body(encoded).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() {return Err(remote_error(response).await)}
    Ok(())
}

fn acknowledged_append(value: &Value, parent: Option<&str>, reset: bool, next: i64, digest: &str, size: u64) -> Option<String> {
    let snapshot=value.get("snapshot")?;
    let id=snapshot.get("id")?.as_str()?;
    let expected_parent=if reset {None} else {parent};
    if snapshot.get("parentSnapshotId")?.as_str()!=expected_parent {return None;}
    let cursor:Value=serde_json::from_str(snapshot.get("sourceCursor")?.as_str()?).ok()?;
    let segment=value.get("segments")?.as_array()?.last()?;
    if cursor.get("byteOffset")?.as_i64()!=Some(next)
        || segment.get("snapshotId")?.as_str()!=Some(id)
        || segment.get("digest")?.as_str()!=Some(digest)
        || segment.get("byteSize")?.as_u64()!=Some(size) {return None;}
    Some(id.to_owned())
}
#[cfg(test)]
mod append_ack_tests {
    use super::*;
    #[test]
    fn lost_ack_requires_exact_parent_offset_digest_and_size() {
        let mut response=json!({"snapshot":{"id":"accepted","parentSnapshotId":"parent","sourceCursor":"{\"byteOffset\":100,\"sourceSize\":200}"},"segments":[{"snapshotId":"accepted","digest":"digest","byteSize":10}]});
        assert_eq!(acknowledged_append(&response,Some("parent"),false,100,"digest",10).as_deref(),Some("accepted"));
        assert!(acknowledged_append(&response,Some("other"),false,100,"digest",10).is_none());
        assert!(acknowledged_append(&response,Some("parent"),false,101,"digest",10).is_none());
        assert!(acknowledged_append(&response,Some("parent"),false,100,"other",10).is_none());
        assert!(acknowledged_append(&response,Some("parent"),false,100,"digest",11).is_none());
        response["snapshot"]["parentSnapshotId"]=Value::Null;
        assert!(acknowledged_append(&response,Some("parent"),false,100,"digest",10).is_none());
        assert_eq!(acknowledged_append(&response,Some("parent"),true,100,"digest",10).as_deref(),Some("accepted"));
        response["segments"][0]["snapshotId"]=json!("unrelated");
        assert!(acknowledged_append(&response,Some("parent"),true,100,"digest",10).is_none());
    }
}
async fn materialize(state: &AppState, share_id: &str) -> Result<String, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.materialize", async {
    chunk_cache::materialize(state,share_id).await
}).await
}

/// Validate access with metadata only. A cached recipient view never waits for replacement
/// bytes; a background job repairs it. Explicit permission denials never fall back to cache.
async fn cached_preview(state: &AppState, id: &str, user: &str) -> Result<Option<(String,String,&'static str)>,LocalError> {
    let cached: Option<(String,String)> = state.inner.store.lock().await.query_row(
        "select raw_path,snapshot_id from session_materializations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2",
        [id,user],|row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(LocalError::internal)?;
    let Some((path,snapshot)) = cached.filter(|(path,_)|Path::new(path).is_file()) else { return Ok(None); };
    let token = access_token_for_user(state,user).await?;
    let response = state.inner.http.get(format!("{}/v1/sessions/{id}/segments?encoded=true",state.inner.server_url))
        .bearer_auth(token).timeout(std::time::Duration::from_secs(2)).send().await;
    let fresh = match response {
        Ok(response) if response.status().is_success() => {
            let metadata: Value = response.json().await.map_err(LocalError::internal)?;
            metadata["snapshot"]["id"].as_str() == Some(snapshot.as_str())
                && (metadata["readIndex"].is_null() || read_index::cached(Path::new(&path)))
        }
        Ok(response) if !matches!(response.status(),StatusCode::BAD_GATEWAY|StatusCode::SERVICE_UNAVAILABLE|StatusCode::GATEWAY_TIMEOUT|StatusCode::REQUEST_TIMEOUT) => return Err(remote_error(response).await),
        _ => false,
    };
    if !fresh {
        let state = state.clone(); let id = id.to_owned(); let user = user.to_owned();
        tokio::spawn(async move {
            let lock = { let mut locks=state.inner.session_sync_locks.lock().await; Arc::clone(locks.entry(id.clone()).or_insert_with(||Arc::new(Mutex::new(())))) };
            let Ok(_guard) = lock.try_lock() else { return; };
            if current_user_id(&state).await.ok().as_deref() != Some(user.as_str()) { return; }
            let _ = record_sync_state(&state,&id,"downloading",None).await;
            let result = materialize(&state,&id).await;
            let _ = record_sync_state(&state,&id,if result.is_ok(){"synced"}else{"failed"},result.err().as_ref().map(|error|error.message.as_str())).await;
        });
    }
    Ok(Some((path,snapshot,if fresh {"current"} else {"stale"})))
}

pub(super) async fn read_session(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
    Json(body): Json<ReadSession>,
) -> Result<Json<Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.read-session", async {
    let source_id = assets::local_id(&state,&share_id).await?;
    let user = current_user_id(&state).await?;
    let source: Option<(String,String)> = state.inner.store.lock().await.query_row(
        "select source_path,source_adapter from local_session_sources where share_id=?1 and user_id=?2",
        rusqlite::params![source_id,user],|row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(LocalError::internal)?;
    // Local preview owns a frozen extent, never the uploader's cursor/lock/cache. An issued
    // pagination cursor keeps that view even while source appends and publication proceeds.
    let local_view = if let Some((source, _)) = source.as_ref().filter(|(path,_)|Path::new(path).is_file()) {
        let dir = state.inner.data_root.join("session-previews").join(&user).join(&source_id);
        let pinned = body.cursor.as_deref().map(|cursor| -> Result<String,LocalError> {
            let raw = URL_SAFE_NO_PAD.decode(cursor).map_err(|_|LocalError::bad_request("Invalid Session cursor"))?;
            let value: Value = serde_json::from_slice(&raw).map_err(|_|LocalError::bad_request("Invalid Session cursor"))?;
            let id = value["snapshot"].as_str().ok_or_else(||LocalError::bad_request("Invalid Session snapshot"))?;
            uuid::Uuid::parse_str(id).map_err(|_|LocalError::bad_request("Invalid Session snapshot"))?;
            Ok(id.to_owned())
        }).transpose()?;
        let snapshot = pinned.clone().or_else(||read_index::reusable(Path::new(source),&dir)).unwrap_or_else(||uuid::Uuid::new_v4().to_string());
        let view=dir.join(format!("{snapshot}.view"));
        let legacy=dir.join(format!("{snapshot}.jsonl"));
        let path=if legacy.is_file() {legacy} else {view};
        if pinned.is_none() && !path.is_file() {
            let source=source.clone();let output=path.clone();
            tokio::task::spawn_blocking(move ||read_index::freeze(Path::new(&source),&output)).await.map_err(LocalError::internal)??;
            read_index::prune_views(&dir,&path);
        }
        if !path.is_file() { return Err(LocalError::bad_request("Pinned Session preview expired; restart pagination")); }
        Some((path.to_string_lossy().into_owned(),snapshot))
    } else { None };
    let cached_view = if local_view.is_none() { cached_preview(&state, &share_id, &user).await? } else { None };
    let pinned_view = local_view.clone().or_else(||cached_view.as_ref().map(|(path,snapshot,_)|(path.clone(),snapshot.clone())));
    let (mut path, cache_state) = if let Some((path,_)) = &pinned_view { (path.clone(), if local_view.is_some() { "local" } else { cached_view.as_ref().unwrap().2 }) } else { match materialize(&state, &share_id).await {
        Ok(path) => (path, "current"),
        Err(error) if matches!(error.status, StatusCode::BAD_GATEWAY | StatusCode::SERVICE_UNAVAILABLE | StatusCode::GATEWAY_TIMEOUT) => {
            // Offline reads may reuse only this authenticated user's previously materialized
            // immutable view. Authorization denials and malformed responses never use fallback.
            let cached: Option<String> = state.inner.store.lock().await.query_row(
                "select raw_path from session_materializations where share_id=?1 and user_id=?2",
                [&share_id, &user], |row|row.get(0)).optional().map_err(LocalError::internal)?;
            match cached.filter(|path|Path::new(path).is_file()) { Some(path)=>(path,"stale"), None=>return Err(error) }
        }
        Err(error) => return Err(error),
    }};
    let (adapter, name, mut snapshot) = {
        let store = state.inner.store.lock().await;
        let cached: Option<(String, String)> = store
            .query_row(
                "select source_adapter,name from session_share_cache where share_id=?1",
                [&share_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        let snapshot: String = if let Some((_,snapshot)) = &pinned_view { snapshot.clone() } else {
            Path::new(&path).file_stem().and_then(|stem|stem.to_str()).ok_or_else(||LocalError::internal("Invalid Session view"))?.to_owned()
        };
        let (adapter, name) = cached.unwrap_or_else(|| (source.as_ref().map(|(_,adapter)|adapter.clone()).unwrap_or_else(||"codex-jsonl-v1".into()), share_id.clone()));
        (adapter, name, snapshot)
    };
    if let Some(cursor) = body.cursor.as_deref() {
        let bytes = URL_SAFE_NO_PAD.decode(cursor).map_err(|_| LocalError::bad_request("Invalid Session cursor"))?;
        let view: Value = serde_json::from_slice(&bytes).map_err(|_| LocalError::bad_request("Invalid Session cursor"))?;
        let pinned = view["snapshot"].as_str().ok_or_else(|| LocalError::bad_request("Invalid Session cursor"))?;
        uuid::Uuid::parse_str(pinned).map_err(|_| LocalError::bad_request("Invalid Session snapshot"))?;
        if pinned != snapshot {
            // materialize above checked present authorization before any cached bytes are used.
            let dir=Path::new(&path).parent().ok_or_else(||LocalError::internal("Invalid Session view"))?;
            let frames=dir.join(format!("{pinned}.chunks"));
            let old = if frames.is_file() {frames} else {dir.join(format!("{pinned}.jsonl"))};
            if !old.is_file() { return Err(LocalError::bad_request("Pinned Session snapshot expired; restart pagination")); }
            path = old.to_string_lossy().into();
            snapshot = pinned.to_string();
        }
    }
    let projection_path = path.clone(); let projection_adapter = adapter.clone();
    let outputs = body.include_outputs.unwrap_or(false); let max_chars = body.max_output_chars_per_item.unwrap_or(4000);
    // Transcript decoding cannot occupy an async runtime worker needed by upload/progress.
    let limit = body.turn_limit.unwrap_or(20).clamp(1, 100);
    chunk_cache::ensure_page(&state,Path::new(&path),&user,outputs,body.cursor.as_deref(),&snapshot,limit).await?;
    let cursor=body.cursor.clone();let projection_snapshot=snapshot.clone();
    let (page,start,invalid_records) = tokio::task::spawn_blocking(move ||
        read_index::page(Path::new(&projection_path), &projection_adapter, outputs, max_chars,cursor.as_deref(),&projection_snapshot,limit)
    ).await.map_err(LocalError::internal)??;
    let next = (start > 0).then(|| encode_cursor(&snapshot, start));
    activity::record_read(&state, &share_id, &user).await;
    Ok(Json(
        json!({"schemaVersion":1,"session":{"id":share_id,"title":name,"provider":adapter.trim_end_matches("-jsonl-v1")},"snapshot":{"id":snapshot},"turns":page,"page":{"hasMore":start>0,"nextCursor":next},"freshness":{"cache":cache_state},"warnings": if invalid_records > 0 { vec![json!({"code":"invalid_utf8_records","count":invalid_records})] } else {vec![]}}),
    ))

}).await
}

#[cfg(test)]
fn project_jsonl(path: &Path, adapter: &str, include_outputs: bool, max_chars: usize) -> Result<(Vec<Value>,usize),LocalError> {
    let input = read_index::input(path)?;
    let mut input=BufReader::new(input);let mut index=0usize;
    let invalid=std::cell::Cell::new(0usize);let error=std::cell::RefCell::new(None);
    let rows=std::iter::from_fn(||loop {
        let mut bytes=Vec::new();
        let result=std::io::BufRead::read_until(&mut input.by_ref().take((SESSION_RECORD_MAX_BYTES+1) as u64),b'\n',&mut bytes);
        match result {
            Ok(0)=>return None,
            Err(e)=>{*error.borrow_mut()=Some(e);return None},
            _=>{}
        }
        if bytes.len()>SESSION_RECORD_MAX_BYTES {*error.borrow_mut()=Some(std::io::Error::other("Session record exceeds reader bound"));return None}
        let line=match std::str::from_utf8(&bytes) {Ok(line)=>line,Err(_)=>{invalid.set(invalid.get()+1);continue}};
        let position=index;index+=1;
        if let Ok(row)=serde_json::from_str::<Value>(line) {return Some((position,row))}
    });
    let turns=match adapter {
        "codex-jsonl-v1"=>project_codex_rows(rows,include_outputs,max_chars),
        "myflicker-desktop-jsonl-v1"=>project_myflicker_desktop_rows(rows.map(|(_,row)|row),include_outputs,max_chars),
        _=>project_anthropic_rows(rows,include_outputs,max_chars),
    };
    if let Some(e)=error.into_inner() {return Err(LocalError::internal(e))}
    Ok((turns,invalid.get()))
}

/// MyFlicker Desktop is not the CLI JSONL shape. Its append-only cache can rewrite a message by
/// repeating its numeric id, and rollback activities retract later ids. Materialize those rules
/// locally before projecting to the common read envelope; the raw snapshot remains untouched.
#[cfg(test)]
fn project_myflicker_desktop(text: &str, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    project_myflicker_desktop_rows(text.lines().filter_map(|line|serde_json::from_str::<Value>(line).ok()),include_outputs,max_chars)
}
#[cfg(test)]
fn project_myflicker_desktop_rows(rows: impl Iterator<Item=Value>, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    let mut live = Vec::<Value>::new();
    for row in rows {
        if row["activityType"] == "CHECKPOINT_ROLLBACK" {
            let description = row
                .pointer("/content/description")
                .and_then(Value::as_str)
                .unwrap_or("");
            if let Some(target) = description
                .split_whitespace()
                .find_map(|part| part.parse::<i64>().ok())
            {
                live.retain(|existing| existing["id"].as_i64().is_none_or(|id| id < target));
            }
            continue;
        }
        if row.get("role").is_none() {
            continue;
        }
        if let Some(id) = row["id"].as_i64() {
            if let Some(position) = live
                .iter()
                .position(|existing| existing["id"].as_i64() == Some(id))
            {
                live[position] = row;
                continue;
            }
        }
        live.push(row);
    }

    let mut turns=Vec::new();
    fold_desktop_rows(live.into_iter().enumerate(),&mut turns,include_outputs,max_chars);
    turns
}
fn fold_desktop_rows(rows: impl Iterator<Item=(usize,Value)>, turns:&mut Vec<Value>, include_outputs:bool,max_chars:usize) {
    for (index, row) in rows {
        let role = row["role"].as_str();
        if role == Some("user") {
            let raw = text_value(&row["content"]).unwrap_or_default();
            if let Some(clean) = clean_user_text(&raw) {
                turns.push(json!({"id":format!("turn-{index}"),"items":[{"type":"userMessage","content":[{"type":"text","text":clean}]}]}));
            }
        } else if role == Some("assistant") {
            if let Some(message) = text_value(&row["content"]).filter(|value| !value.is_empty()) {
                push_item(
                    turns,
                    json!({"type":"agentMessage","text":message}),
                    index,
                );
            }
            for call in row["toolCalls"].as_array().cloned().unwrap_or_default() {
                let function = call.get("function").unwrap_or(&Value::Null);
                let id = call["id"].as_str().unwrap_or("call");
                let tool = function["name"]
                    .as_str()
                    .or_else(|| call["name"].as_str())
                    .unwrap_or("tool");
                let raw = function
                    .get("arguments")
                    .or_else(|| call.get("arguments"))
                    .cloned()
                    .unwrap_or(Value::Null);
                let arguments = raw
                    .as_str()
                    .and_then(|value| serde_json::from_str(value).ok())
                    .unwrap_or(raw);
                push_item(
                    turns,
                    json!({"type":if matches!(tool,"execute_command"|"bash"|"shell"|"terminal"|"run_command") {"commandExecution"} else {"mcpToolCall"},"id":id,"server":"myflicker","tool":tool,"arguments":arguments,"status":"inProgress"}),
                    index,
                );
            }
        } else if role == Some("tool") && include_outputs {
            let call = row["toolCallId"]
                .as_str()
                .or_else(|| row["tool_use_id"].as_str())
                .unwrap_or("");
            attach_result(
                turns,
                call,
                &text_value(&row["content"]).unwrap_or_default(),
                max_chars,
            );
        } else if role == Some("reasoning") && include_outputs {
            if let Some(reasoning) = text_value(&row["content"]) {
                push_item(
                    turns,
                    json!({"type":"reasoning","summary":[reasoning]}),
                    index,
                );
            }
        }
    }
}

#[cfg(test)]
fn project_codex(text: &str, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    project_codex_rows(text.lines().enumerate().filter_map(|(index,line)| serde_json::from_str::<Value>(line).ok().map(|row|(index,row))),include_outputs,max_chars)
}

#[cfg(test)]
fn project_codex_rows(rows: impl Iterator<Item=(usize,Value)>, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    let mut turns=Vec::new();
    fold_codex_rows(rows,&mut turns,include_outputs,max_chars);
    turns
        .into_iter()
        .filter(|t| t["items"].as_array().is_some_and(|x| !x.is_empty()))
        .collect()
}
fn fold_codex_rows(rows: impl Iterator<Item=(usize,Value)>, turns: &mut Vec<Value>, include_outputs: bool, max_chars: usize) {
    for (index, v) in rows {
        let row_type = v.get("type").and_then(Value::as_str);
        let payload = v.get("payload").unwrap_or(&Value::Null);
        let payload_type = payload.get("type").and_then(Value::as_str);
        if row_type == Some("response_item") && payload_type == Some("message") {
            for block in payload["content"].as_array().into_iter().flatten() {
                if matches!(block["type"].as_str(), Some("tool_result" | "tool-result")) && include_outputs {
                    let call = block["tool_use_id"].as_str().or_else(|| block["toolCallId"].as_str()).unwrap_or("");
                    attach_result(turns, call, &tool_result_text(block), max_chars);
                }
            }
        }
        if row_type == Some("event_msg") && payload_type == Some("task_started") {
            turns.push(json!({"id":payload.get("turn_id").and_then(Value::as_str).unwrap_or("turn"),"items":[]}));
            continue;
        }
        let user = if row_type == Some("response_item")
            && payload_type == Some("message")
            && payload.get("role").and_then(Value::as_str) == Some("user")
        {
            text_value(&payload["content"])
        } else if row_type == Some("event_msg") && payload_type == Some("user_message") {
            payload
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        };
        if let Some(raw) = user {
            let Some(clean) = clean_user_text(&raw) else {
                continue;
            };
            // Codex records the same user input as both a response item and an event.
            // These are two representations of one turn, not two user messages.
            if turns.last().and_then(|t| t["items"].as_array()).is_some_and(|items| {
                items.last().is_some_and(|item| item["type"] == "userMessage"
                    && item.pointer("/content/0/text").and_then(Value::as_str) == Some(clean.as_str()))
            }) {
                continue;
            }
            if turns
                .last()
                .and_then(|t| t["items"].as_array())
                .is_none_or(|items| items.iter().any(|i| i["type"] == "userMessage"))
            {
                turns.push(json!({"id":format!("turn-{index}"),"items":[]}));
            }
            push_item(
                turns,
                json!({"type":"userMessage","content":[{"type":"text","text":clean}]}),
                index,
            );
            continue;
        }
        if row_type == Some("response_item")
            && payload_type == Some("message")
            && payload.get("role").and_then(Value::as_str) == Some("assistant")
        {
            if let Some(text) = text_value(&payload["content"]) {
                push_item(
                    turns,
                    json!({"type":"agentMessage","text":text,"phase":payload.get("phase")}),
                    index,
                )
            };
            continue;
        }
        if row_type == Some("event_msg") && payload_type == Some("agent_message") {
            if let Some(text) = payload.get("message").and_then(Value::as_str) {
                push_item(
                    turns,
                    json!({"type":"agentMessage","text":text,"phase":payload.get("phase")}),
                    index,
                )
            };
            continue;
        }
        if row_type == Some("response_item")
            && matches!(
                payload_type,
                Some("function_call") | Some("custom_tool_call")
            )
        {
            let call = payload
                .get("call_id")
                .or_else(|| payload.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("call");
            let tool = payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let arguments = payload
                .get("arguments")
                .or_else(|| payload.get("input"))
                .cloned()
                .unwrap_or(Value::Null);
            let arguments = arguments
                .as_str()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or(arguments);
            let kind = if matches!(tool, "exec_command" | "shell" | "bash") {
                "commandExecution"
            } else {
                "mcpToolCall"
            };
            push_item(
                turns,
                json!({"type":kind,"id":call,"server":"codex","tool":tool,"arguments":arguments,"status":"inProgress"}),
                index,
            );
            continue;
        }
        if include_outputs
            && row_type == Some("response_item")
            && matches!(
                payload_type,
                Some("function_call_output") | Some("custom_tool_call_output")
            )
        {
            let call = payload.get("call_id").and_then(Value::as_str).unwrap_or("");
            let output =
                text_value(payload.get("output").unwrap_or(&Value::Null)).unwrap_or_default();
            attach_result(turns, call, &output, max_chars);
        }
        if include_outputs && row_type == Some("response_item") && payload_type == Some("reasoning")
        {
            let text =
                text_value(payload.get("summary").unwrap_or(&Value::Null)).unwrap_or_default();
            if !text.is_empty() {
                push_item(
                    turns,
                    json!({"type":"reasoning","summary":[text]}),
                    index,
                )
            }
        }
    }
}

#[cfg(test)]
fn project_anthropic(text: &str, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    project_anthropic_rows(text.lines().enumerate().filter_map(|(index,line)| serde_json::from_str::<Value>(line).ok().map(|row|(index,row))),include_outputs,max_chars)
}

#[cfg(test)]
fn project_anthropic_rows(rows: impl Iterator<Item=(usize,Value)>, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    let mut turns=Vec::new();
    fold_anthropic_rows(rows,&mut turns,include_outputs,max_chars);
    turns
}
fn fold_anthropic_rows(rows: impl Iterator<Item=(usize,Value)>, turns: &mut Vec<Value>, include_outputs: bool, max_chars: usize) {
    for (index, v) in rows {
        // MyFlicker records use `type: message` with a top-level role/content,
        // while Claude Code wraps role/content in `message`. Keep the raw
        // formats untouched at rest and converge them only in this adapter.
        let role = v
            .get("role")
            .and_then(Value::as_str)
            .or_else(|| v.pointer("/message/role").and_then(Value::as_str))
            .or_else(|| {
                v.get("type")
                    .and_then(Value::as_str)
                    .filter(|kind| matches!(*kind, "user" | "assistant" | "tool"))
            });
        let blocks = v.pointer("/message/content").or_else(|| v.get("content"));
        if role == Some("user") {
            let mut user_text = Vec::new();
            for block in blocks
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
            {
                if matches!(block["type"].as_str(), Some("tool_result" | "tool-result")) {
                    if include_outputs {
                        attach_result(
                            turns,
                            block["tool_use_id"]
                                .as_str()
                                .or_else(|| block["toolCallId"].as_str())
                                .unwrap_or(""),
                            &tool_result_text(&block),
                            max_chars,
                        )
                    }
                } else if let Some(t) = text_value(&block) {
                    user_text.push(t)
                }
            }
            if blocks.and_then(Value::as_str).is_some() {
                user_text.push(blocks.and_then(Value::as_str).unwrap().into())
            }
            if !user_text.is_empty() {
                turns.push(json!({"id":format!("turn-{index}"),"items":[{"type":"userMessage","content":[{"type":"text","text":user_text.join("\n")}]}]}))
            }
            continue;
        }
        if role == Some("assistant") {
            for block in blocks
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
            {
                match block["type"].as_str() {
                    Some("text") => push_item(
                        turns,
                        json!({"type":"agentMessage","text":block["text"]}),
                        index,
                    ),
                    Some("thinking") if include_outputs => push_item(
                        turns,
                        json!({"type":"reasoning","summary":[block["thinking"].as_str().unwrap_or("")]}),
                        index,
                    ),
                    Some("tool_use") => push_item(
                        turns,
                        json!({
                            "type": if matches!(block["name"].as_str(), Some("bash" | "shell")) { "commandExecution" } else { "mcpToolCall" },
                            "id":block["id"],"server":"agent","tool":block["name"],"arguments":block["input"],"status":"inProgress"
                        }),
                        index,
                    ),
                    _ => {}
                }
            }
            continue;
        }
        if role == Some("tool") && include_outputs {
            for block in blocks
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
            {
                if matches!(block["type"].as_str(), Some("tool_result" | "tool-result")) {
                    let call = block["tool_use_id"]
                        .as_str()
                        .or_else(|| block["toolCallId"].as_str())
                        .unwrap_or("");
                    attach_result(turns, call, &tool_result_text(&block), max_chars);
                }
            }
        }
    }
}

fn tool_result_text(block: &Value) -> String {
    block
        .pointer("/result/llmContent")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| text_value(block.get("content").unwrap_or(&Value::Null)))
        .unwrap_or_default()
}

fn push_item(turns: &mut Vec<Value>, item: Value, index: usize) {
    if turns.is_empty() {
        turns.push(json!({"id":format!("turn-{index}"),"items":[]}))
    }
    let items = turns.last_mut().unwrap()["items"]
        .as_array_mut()
        .unwrap();
    // Mirrored Codex agent_message/response_item records must not duplicate prose.
    if item["type"] == "agentMessage" && items.last().is_some_and(|last| last["type"] == "agentMessage" && last["text"] == item["text"]) { return; }
    items.push(item)
}
fn attach_result(turns: &mut [Value], call: &str, output: &str, max: usize) {
    for turn in turns.iter_mut().rev() {
        if let Some(items) = turn["items"].as_array_mut() {
            if let Some(item) = items
                .iter_mut()
                .rev()
                .find(|i| i["id"].as_str() == Some(call))
            {
                let (text, truncated) = truncate(output, max);
                item["status"] = json!("completed");
                item["result"] = json!({"text":text,"truncated":truncated,"originalChars":output.chars().count()});
                return;
            }
        }
    }
}
fn clean_user_text(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.starts_with("<environment_context>")
        || s.starts_with("<recommended_plugins>")
        || s.starts_with("<app-context>")
    {
        return None;
    }
    if let Some((_, request)) = s.rsplit_once("## My request for Codex:") {
        return Some(request.trim().into());
    }
    (!s.is_empty()).then(|| s.into())
}

fn extract_user_text(v: &Value) -> Option<String> {
    let role = v
        .pointer("/payload/role")
        .or_else(|| v.get("role"))
        .and_then(Value::as_str);
    if role == Some("user") || v.get("type").and_then(Value::as_str) == Some("user") {
        return text_value(
            v.pointer("/payload/content")
                .or_else(|| v.get("message"))
                .or_else(|| v.get("content"))?,
        );
    }
    None
}
fn text_value(v: &Value) -> Option<String> {
    // Tool protocol blocks are not conversational text, even when providers wrap
    // their results inside a user-role envelope. Dedicated adapters own them.
    if matches!(v.get("type").and_then(Value::as_str), Some("tool_use" | "tool_result" | "tool-result" | "function_call" | "function_call_output" | "custom_tool_call" | "custom_tool_call_output")) {
        return None;
    }
    if let Some(s) = v.as_str() {
        return Some(s.into());
    }
    if let Some(s) = v.get("text").and_then(Value::as_str) {
        return Some(s.into());
    }
    if let Some(content) = v.get("content") {
        return text_value(content);
    }
    let values = v
        .as_array()?
        .iter()
        .filter_map(|x| text_value(x))
        .collect::<Vec<_>>();
    (!values.is_empty()).then(|| values.join("\n"))
}
fn truncate(s: &str, max: usize) -> (String, bool) {
    if s.chars().count() <= max {
        return (s.into(), false);
    }
    (s.chars().take(max).collect(), true)
}
fn encode_cursor(snapshot: &str, before: usize) -> String {
    URL_SAFE_NO_PAD.encode(json!({"v":1,"snapshot":snapshot,"before":before}).to_string())
}
fn decode_cursor(cursor: Option<&str>, snapshot: &str, total: usize) -> Result<usize, LocalError> {
    let Some(cursor) = cursor else {
        return Ok(total);
    };
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| LocalError::bad_request("Invalid Session cursor"))?;
    let v: Value = serde_json::from_slice(&bytes)
        .map_err(|_| LocalError::bad_request("Invalid Session cursor"))?;
    if v["snapshot"] != snapshot {
        return Err(LocalError::bad_request(
            "Session cursor belongs to an older snapshot",
        ));
    }
    Ok(v["before"]
        .as_u64()
        .unwrap_or(total as u64)
        .min(total as u64) as usize)
}

pub(super) async fn withdraw_session(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.withdraw-session", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .delete(format!("{}/v1/sessions/{share_id}", state.inner.server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    assets::after_withdraw(&state,&share_id,"session").await?;
    Ok(StatusCode::NO_CONTENT)

}).await
}

#[cfg(test)]
mod tests {
    #[test]
    fn tool_envelopes_are_not_user_prose_and_mirrored_messages_are_one_turn() {
        let rows = [
            serde_json::json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Question"}]}}),
            serde_json::json!({"type":"event_msg","payload":{"type":"user_message","message":"Question"}}),
            serde_json::json!({"type":"response_item","payload":{"type":"function_call","name":"shell","call_id":"call","arguments":"{}"}}),
            serde_json::json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"tool_result","tool_use_id":"call","content":"Tool result, not user"}]}}),
            serde_json::json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Answer"}]}}),
            serde_json::json!({"type":"event_msg","payload":{"type":"agent_message","message":"Answer"}}),
        ];
        let text = rows.iter().map(ToString::to_string).collect::<Vec<_>>().join("\n");
        let turns = super::project_codex(&text, true, 4000);
        assert_eq!(turns.len(), 1);
        let items = turns[0]["items"].as_array().unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[1]["type"], "commandExecution");
        assert_eq!(items[1].pointer("/result/text").unwrap(), "Tool result, not user");
    }
    #[test]
    fn damaged_utf8_record_does_not_erase_valid_conversation() {
        let path = std::env::temp_dir().join(format!("colab-utf8-{}.jsonl", uuid::Uuid::new_v4()));
        let mut bytes = br#"{"type":"message","role":"user","content":[{"type":"text","text":"Valid question"}]}"#.to_vec();
        bytes.extend_from_slice(b"\n{\"damaged\":\"\xff\"}\n");
        std::fs::write(&path, &bytes).unwrap();
        let (turns, invalid) = super::project_jsonl(&path, "myflicker-jsonl-v1", false, 4000).unwrap();
        assert_eq!(invalid, 1);
        assert_eq!(turns.len(), 1);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        std::fs::remove_file(path).unwrap();
    }
    use super::*;

    #[test]
    fn session_segments_are_bounded_and_never_split_jsonl_records() {
        let first = vec![b'a'; SESSION_SEGMENT_TARGET_BYTES - 1];
        let second = vec![b'b'; 32];
        let mut input = first.clone();
        input.push(b'\n');
        input.extend_from_slice(&second);
        input.push(b'\n');
        input.extend_from_slice(b"partial");
        let mut reader = BufReader::new(std::io::Cursor::new(input));

        let segment = read_session_segment(&mut reader).unwrap().unwrap();
        assert_eq!(segment.len(), SESSION_SEGMENT_TARGET_BYTES);
        assert_eq!(segment.last(), Some(&b'\n'));
        let segment = read_session_segment(&mut reader).unwrap().unwrap();
        assert_eq!(segment, [second, vec![b'\n']].concat());
        assert!(read_session_segment(&mut reader).unwrap().is_none());
    }

    #[test]
    fn session_segment_rejects_one_unbounded_provider_record() {
        let mut input = vec![b'x'; SESSION_RECORD_MAX_BYTES + 1];
        input.push(b'\n');
        let error =
            read_session_segment(&mut BufReader::new(std::io::Cursor::new(input))).unwrap_err();
        assert!(error.message.contains("larger than"));
    }

    #[test]
    fn codex_and_myflicker_are_projected_at_read_time() {
        let root = std::env::temp_dir().join(format!("colab-session-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let codex = root.join("codex.jsonl");
        fs::write(&codex, "{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"text\":\"question\"}]}}\n{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"text\":\"answer\"}]}}\n").unwrap();
        let (turns, _) = project_jsonl(&codex, "codex-jsonl-v1", false, 4000).unwrap();
        assert_eq!(turns[0]["items"][0]["content"][0]["text"], "question");
        assert_eq!(turns[0]["items"][1]["text"], "answer");
        let flicker = root.join("flicker.jsonl");
        fs::write(&flicker, "{\"type\":\"message\",\"role\":\"user\",\"content\":\"hello\"}\n{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"call-1\",\"name\":\"bash\",\"input\":{\"command\":\"pwd\"}},{\"type\":\"text\",\"text\":\"world\"}]}\n{\"type\":\"message\",\"role\":\"tool\",\"content\":[{\"type\":\"tool-result\",\"toolCallId\":\"call-1\",\"result\":{\"llmContent\":\"/tmp\"}}]}\n").unwrap();
        let (turns, _) = project_jsonl(&flicker, "myflicker-jsonl-v1", true, 4000).unwrap();
        assert_eq!(turns[0]["items"][0]["content"][0]["text"], "hello");
        assert_eq!(turns[0]["items"][1]["type"], "commandExecution");
        assert_eq!(turns[0]["items"][1]["result"]["text"], "/tmp");
        assert_eq!(turns[0]["items"][2]["text"], "world");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn page_cursor_is_snapshot_pinned() {
        let cursor = encode_cursor("snapshot-a", 7);
        assert_eq!(decode_cursor(Some(&cursor), "snapshot-a", 10).unwrap(), 7);
        assert!(decode_cursor(Some(&cursor), "snapshot-b", 10).is_err());
    }

    #[test]
    fn myflicker_desktop_rewrites_and_tools_are_projected_at_read_time() {
        let text = concat!(
            "{\"id\":1,\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"old\"}]}\n",
            "{\"id\":1,\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"new\"}]}\n",
            "{\"id\":2,\"role\":\"assistant\",\"content\":\"answer\",\"toolCalls\":[{\"id\":\"call-1\",\"function\":{\"name\":\"bash\",\"arguments\":\"{\\\"command\\\":\\\"pwd\\\"}\"}}]}\n",
            "{\"id\":3,\"role\":\"tool\",\"toolCallId\":\"call-1\",\"content\":\"/tmp\"}\n"
        );
        let turns = project_myflicker_desktop(text, true, 4000);
        assert_eq!(turns[0]["items"][0]["content"][0]["text"], "new");
        assert_eq!(turns[0]["items"][1]["text"], "answer");
        assert_eq!(turns[0]["items"][2]["result"]["text"], "/tmp");
    }

    #[test]
    fn native_title_catalog_regression() {
        struct Fixture(PathBuf);
        impl Drop for Fixture {
            fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
        }
        let fixture = Fixture(std::env::temp_dir().join(format!("colab-native-title-{}", Uuid::new_v4())));
        let home = &fixture.0;
        let codex = home.join(".codex/sessions/project/thread.jsonl");
        let claude = home.join(".claude/projects/project/thread.jsonl");
        for path in [&codex, &claude] { fs::create_dir_all(path.parent().unwrap()).unwrap(); }
        let original = "{\"type\":\"message\",\"role\":\"user\",\"content\":\"Original instruction\"}\n";
        fs::write(&codex, original).unwrap();
        fs::write(&claude, format!("{original}{{\"type\":\"custom-title\",\"customTitle\":\"Old CC name\"}}\n{{\"type\":\"summary\",\"summary\":\"Generated summary\"}}\n{{\"type\":\"custom-title\",\"customTitle\":\"Current CC name\"}}\n")).unwrap();
        let db = rusqlite::Connection::open(home.join(".codex/state_5.sqlite")).unwrap();
        db.execute_batch("create table threads(rollout_path text,name text,title text)").unwrap();
        db.execute("insert into threads values(?1,'Native Codex name','Original instruction')", [codex.to_string_lossy().as_ref()]).unwrap();
        let (_, first) = discover_session_catalog(Some(home), &HashMap::new());
        assert_eq!(first.iter().find(|entry| entry.provider == "codex").unwrap().name, "Native Codex name");
        assert_eq!(first.iter().find(|entry| entry.provider == "claude-code").unwrap().name, "Current CC name");
        let known = first.into_iter().map(|entry| ((entry.provider.clone(), entry.source_path.clone()), entry)).collect();
        assert!(discover_session_catalog(Some(home), &known).1.is_empty());
        db.execute("update threads set name='Renamed Codex name'", []).unwrap();
        let (_, renamed) = discover_session_catalog(Some(home), &known);
        assert_eq!(renamed.len(), 1);
        assert_eq!(renamed[0].name, "Renamed Codex name");
        assert_eq!(fs::read_to_string(&codex).unwrap(), original);
        db.execute("update threads set name=null", []).unwrap();
        assert_eq!(discover_session_catalog(Some(home), &HashMap::new()).1.iter().find(|entry| entry.provider == "codex").unwrap().name, "Original instruction");
        drop(db);
    }

    #[test]
    fn session_catalog_indexes_three_providers_and_skips_unchanged_files() {
        let home = std::env::temp_dir().join(format!("colab-catalog-{}", Uuid::new_v4()));
        let fixtures = [
            (
                ".codex/sessions/project/codex-thread.jsonl",
                "codex",
                "Codex title",
            ),
            (
                ".codeflicker/projects/flicker-thread.jsonl",
                "myflicker",
                "Flicker title",
            ),
            (
                ".claude/projects/claude-thread.jsonl",
                "claude-code",
                "Claude title",
            ),
        ];
        for (relative, _, title) in fixtures {
            let path = home.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(
                path,
                format!("{{\"type\":\"message\",\"role\":\"user\",\"content\":\"{title}\"}}\n"),
            )
            .unwrap();
        }

        let (seen, changed) = discover_session_catalog(Some(&home), &HashMap::new());
        assert_eq!(seen.len(), 3);
        assert_eq!(changed.len(), 3);
        for (_, provider, title) in fixtures {
            assert!(
                changed
                    .iter()
                    .any(|entry| entry.provider == provider && entry.name == title)
            );
        }

        let known = changed
            .into_iter()
            .map(|entry| ((entry.provider.clone(), entry.source_path.clone()), entry))
            .collect::<HashMap<_, _>>();
        let (_, unchanged) = discover_session_catalog(Some(&home), &known);
        assert!(unchanged.is_empty());
        let _ = fs::remove_dir_all(home);
    }
}
