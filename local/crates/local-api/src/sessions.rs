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
        // window coalesces those writes; explicit share/read still calls `sync_source` immediately.
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
    let context=envelope.as_deref().and_then(|raw|serde_json::from_str(raw).ok()).unwrap_or_default();
    let result=colab_observability::resume(&context,sync_source(state,id)).await;
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
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/channels/{channel_id}/sessions",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .json(&json!({"name":name,"sourceAdapter":body.source_adapter}))
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let share: SessionShare = response.json().await.map_err(LocalError::internal)?;
    let user = current_user_id(&state).await?;
    let trace_context = colab_observability::context_json();
    {
        let store = state.inner.store.lock().await;
        store.execute("insert into local_session_sources(share_id,channel_id,user_id,source_path,source_adapter,source_thread_id,trace_context) values(?1,?2,?3,?4,?5,?6,?7)",rusqlite::params![share.id,channel_id,user,path.to_string_lossy(),body.source_adapter,path.file_stem().and_then(|x|x.to_str()), if trace_context.is_null(){None}else{Some(trace_context.to_string())}]).map_err(LocalError::internal)?;
    }
    // Registration is accepted immediately. Initial publication uses the same background path as
    // later increments so a large existing transcript never makes the GUI guess whether a timed
    // out request actually created the share.
    let sync_state = state.clone();
    let sync_share_id = share.id.clone();
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

    sync_source(&state, &share_id).await?;
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
    let length = fs::metadata(&path).map_err(LocalError::internal)?.len() as i64;
    let reset_chain = length < offset;
    let start = if reset_chain { 0 } else { offset };
    if length == start {
        return Ok(());
    }
    let mut file = fs::File::open(&path).map_err(LocalError::internal)?;
    file.seek(SeekFrom::Start(start as u64))
        .map_err(LocalError::internal)?;
    let token = access_token(state).await?;
    // Freeze the readable extent for this pass. Concurrent appends are intentionally left for
    // the next pass, which prevents a busy transcript from making synchronization unbounded.
    let mut reader = BufReader::new(file.take((length - start) as u64));
    let mut published = start;
    let mut first_segment = true;
    while let Some(bytes) = read_session_segment(&mut reader)? {
        let next = published + bytes.len() as i64;
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
        let response = request
            .body(bytes)
            .send()
            .await
            .map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        let value: Value = response.json().await.map_err(LocalError::internal)?;
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
    }
    Ok(())

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

async fn materialize(state: &AppState, share_id: &str) -> Result<String, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.materialize", async {

    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/sessions/{share_id}/segments",
            state.inner.server_url
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|error| LocalError { status: StatusCode::SERVICE_UNAVAILABLE, message:error.to_string() })?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let value: Value = response.json().await.map_err(LocalError::internal)?;
    let snapshot = value["snapshot"]["id"]
        .as_str()
        .ok_or_else(|| LocalError::internal("Session has no synchronized snapshot"))?
        .to_string();
    let user = current_user_id(state).await?;
    let dir = state
        .inner
        .data_root
        .join("sessions")
        .join(&user)
        .join(share_id);
    fs::create_dir_all(&dir).map_err(LocalError::internal)?;
    let final_path = dir.join(format!("{snapshot}.jsonl"));
    if !final_path.exists() {
        let temporary = final_path.with_extension("jsonl.partial");
        let previous: Option<(String, PathBuf)> = {
            let store = state.inner.store.lock().await;
            store.query_row("select snapshot_id,raw_path from session_materializations where share_id=?1 and user_id=?2",[share_id,&user],|row|Ok((row.get(0)?,PathBuf::from(row.get::<_,String>(1)?)))).ok()
        };
        let segments = value["segments"].as_array().cloned().unwrap_or_default();
        let start_index = previous
            .as_ref()
            .and_then(|(old_snapshot, old_path)| {
                old_path
                    .exists()
                    .then(|| {
                        segments
                            .iter()
                            .position(|segment| {
                                segment["snapshotId"].as_str() == Some(old_snapshot.as_str())
                            })
                            .map(|index| index + 1)
                    })
                    .flatten()
            })
            .unwrap_or(0);
        if let Some((_, old_path)) = previous.as_ref().filter(|_| start_index > 0) {
            fs::copy(old_path, &temporary).map_err(LocalError::internal)?;
        } else {
            fs::File::create(&temporary).map_err(LocalError::internal)?;
        }
        let mut output = fs::OpenOptions::new()
            .append(true)
            .open(&temporary)
            .map_err(LocalError::internal)?;
        for segment in segments.into_iter().skip(start_index) {
            let id = segment["id"]
                .as_str()
                .ok_or_else(|| LocalError::internal("Invalid Session segment"))?;
            let mut response = state
                .inner
                .http
                .get(format!(
                    "{}/v1/session-segments/{id}/content",
                    state.inner.server_url
                ))
                .bearer_auth(&token)
                .send()
                .await
                .map_err(|error| LocalError { status: StatusCode::SERVICE_UNAVAILABLE, message:error.to_string() })?;
            if !response.status().is_success() {
                return Err(remote_error(response).await);
            }
            while let Some(bytes) = response.chunk().await.map_err(|error| LocalError { status:StatusCode::SERVICE_UNAVAILABLE, message:error.to_string() })? {
                output.write_all(&bytes).map_err(LocalError::internal)?;
            }
        }
        output.flush().map_err(LocalError::internal)?;
        fs::rename(temporary, &final_path).map_err(LocalError::internal)?;
        // Retain immutable views for cursors already issued to readers. A new current
        // snapshot must not invalidate an in-flight pagination session.
        let mut views: Vec<_> = fs::read_dir(&dir).map_err(LocalError::internal)?
            .filter_map(Result::ok).filter(|e| e.path().extension().is_some_and(|x| x == "jsonl"))
            .collect();
        views.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
        let remove_count = views.len().saturating_sub(8);
        for view in views.into_iter().take(remove_count) {
            if view.path() != final_path { let _ = fs::remove_file(view.path()); }
        }
    }
    let store = state.inner.store.lock().await;
    store.execute("insert into session_materializations(share_id,user_id,snapshot_id,raw_path) values(?1,?2,?3,?4) on conflict(share_id,user_id) do update set snapshot_id=excluded.snapshot_id,raw_path=excluded.raw_path,updated_at=current_timestamp",rusqlite::params![share_id,user,snapshot,final_path.to_string_lossy()]).map_err(LocalError::internal)?;
    Ok(final_path.to_string_lossy().into())

}).await
}

pub(super) async fn read_session(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
    Json(body): Json<ReadSession>,
) -> Result<Json<Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.sessions.read-session", async {

    // Contributors publish pending bytes before reading; consumers pull the current immutable
    // snapshot. Both then execute the same adapter projection over a local raw cache.
    // This is a no-op for consumers. For the contributor it must succeed; hiding the upload
    // error would replace the actionable cause with a misleading "no synchronized snapshot".
    sync_source(&state, &share_id).await?;
    let user = current_user_id(&state).await?;
    let (mut path, cache_state) = match materialize(&state, &share_id).await {
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
    };
    let (adapter, name, mut snapshot) = {
        let store = state.inner.store.lock().await;
        let cached: Option<(String, String)> = store
            .query_row(
                "select source_adapter,name from session_share_cache where share_id=?1",
                [&share_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        let snapshot: String = store
            .query_row(
                "select snapshot_id from session_materializations where share_id=?1 and user_id=?2",
                [&share_id, &user],
                |r| r.get(0),
            )
            .map_err(LocalError::internal)?;
        let (adapter, name) = cached.unwrap_or_else(|| ("codex-jsonl-v1".into(), share_id.clone()));
        (adapter, name, snapshot)
    };
    if let Some(cursor) = body.cursor.as_deref() {
        let bytes = URL_SAFE_NO_PAD.decode(cursor).map_err(|_| LocalError::bad_request("Invalid Session cursor"))?;
        let view: Value = serde_json::from_slice(&bytes).map_err(|_| LocalError::bad_request("Invalid Session cursor"))?;
        let pinned = view["snapshot"].as_str().ok_or_else(|| LocalError::bad_request("Invalid Session cursor"))?;
        uuid::Uuid::parse_str(pinned).map_err(|_| LocalError::bad_request("Invalid Session snapshot"))?;
        if pinned != snapshot {
            // materialize above checked present authorization before any cached bytes are used.
            let old = state.inner.data_root.join("sessions").join(&user).join(&share_id).join(format!("{pinned}.jsonl"));
            if !old.is_file() { return Err(LocalError::bad_request("Pinned Session snapshot expired; restart pagination")); }
            path = old.to_string_lossy().into();
            snapshot = pinned.to_string();
        }
    }
    let mut turns = project_jsonl(
        Path::new(&path),
        &adapter,
        body.include_outputs.unwrap_or(false),
        body.max_output_chars_per_item.unwrap_or(4000),
    )?;
    let before = decode_cursor(body.cursor.as_deref(), &snapshot, turns.len())?;
    let limit = body.turn_limit.unwrap_or(20).clamp(1, 100);
    let start = before.saturating_sub(limit);
    let page = turns.drain(start..before).collect::<Vec<_>>();
    let next = (start > 0).then(|| encode_cursor(&snapshot, start));
    activity::record_read(&state, &share_id, &user).await;
    Ok(Json(
        json!({"schemaVersion":1,"session":{"id":share_id,"title":name,"provider":adapter.trim_end_matches("-jsonl-v1")},"snapshot":{"id":snapshot},"turns":page,"page":{"hasMore":start>0,"nextCursor":next},"freshness":{"cache":cache_state}}),
    ))

}).await
}

fn project_jsonl(
    path: &Path,
    adapter: &str,
    include_outputs: bool,
    max_chars: usize,
) -> Result<Vec<Value>, LocalError> {
    let text = fs::read_to_string(path).map_err(LocalError::internal)?;
    if adapter == "codex-jsonl-v1" {
        return Ok(project_codex(&text, include_outputs, max_chars));
    }
    if adapter == "myflicker-desktop-jsonl-v1" {
        return Ok(project_myflicker_desktop(&text, include_outputs, max_chars));
    }
    Ok(project_anthropic(&text, include_outputs, max_chars))
}

/// MyFlicker Desktop is not the CLI JSONL shape. Its append-only cache can rewrite a message by
/// repeating its numeric id, and rollback activities retract later ids. Materialize those rules
/// locally before projecting to the common read envelope; the raw snapshot remains untouched.
fn project_myflicker_desktop(text: &str, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    let mut live = Vec::<Value>::new();
    for line in text.lines() {
        let Ok(row) = serde_json::from_str::<Value>(line) else {
            continue;
        };
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

    let mut turns = Vec::<Value>::new();
    for (index, row) in live.into_iter().enumerate() {
        let role = row["role"].as_str();
        if role == Some("user") {
            let raw = text_value(&row["content"]).unwrap_or_default();
            if let Some(clean) = clean_user_text(&raw) {
                turns.push(json!({"id":format!("turn-{index}"),"items":[{"type":"userMessage","content":[{"type":"text","text":clean}]}]}));
            }
        } else if role == Some("assistant") {
            if let Some(message) = text_value(&row["content"]).filter(|value| !value.is_empty()) {
                push_item(
                    &mut turns,
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
                    &mut turns,
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
                &mut turns,
                call,
                &text_value(&row["content"]).unwrap_or_default(),
                max_chars,
            );
        } else if role == Some("reasoning") && include_outputs {
            if let Some(reasoning) = text_value(&row["content"]) {
                push_item(
                    &mut turns,
                    json!({"type":"reasoning","summary":[reasoning]}),
                    index,
                );
            }
        }
    }
    turns
}

fn project_codex(text: &str, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    let mut turns = Vec::<Value>::new();
    for (index, line) in text.lines().enumerate() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let row_type = v.get("type").and_then(Value::as_str);
        let payload = v.get("payload").unwrap_or(&Value::Null);
        let payload_type = payload.get("type").and_then(Value::as_str);
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
            if turns
                .last()
                .and_then(|t| t["items"].as_array())
                .is_none_or(|items| items.iter().any(|i| i["type"] == "userMessage"))
            {
                turns.push(json!({"id":format!("turn-{index}"),"items":[]}));
            }
            push_item(
                &mut turns,
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
                    &mut turns,
                    json!({"type":"agentMessage","text":text,"phase":payload.get("phase")}),
                    index,
                )
            };
            continue;
        }
        if row_type == Some("event_msg") && payload_type == Some("agent_message") {
            if let Some(text) = payload.get("message").and_then(Value::as_str) {
                push_item(
                    &mut turns,
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
                &mut turns,
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
            attach_result(&mut turns, call, &output, max_chars);
        }
        if include_outputs && row_type == Some("response_item") && payload_type == Some("reasoning")
        {
            let text =
                text_value(payload.get("summary").unwrap_or(&Value::Null)).unwrap_or_default();
            if !text.is_empty() {
                push_item(
                    &mut turns,
                    json!({"type":"reasoning","summary":[text]}),
                    index,
                )
            }
        }
    }
    turns
        .into_iter()
        .filter(|t| t["items"].as_array().is_some_and(|x| !x.is_empty()))
        .collect()
}

fn project_anthropic(text: &str, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    let mut turns = Vec::<Value>::new();
    for (index, line) in text.lines().enumerate() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
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
                            &mut turns,
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
                        &mut turns,
                        json!({"type":"agentMessage","text":block["text"]}),
                        index,
                    ),
                    Some("thinking") if include_outputs => push_item(
                        &mut turns,
                        json!({"type":"reasoning","summary":[block["thinking"].as_str().unwrap_or("")]}),
                        index,
                    ),
                    Some("tool_use") => push_item(
                        &mut turns,
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
                    attach_result(&mut turns, call, &tool_result_text(&block), max_chars);
                }
            }
        }
    }
    turns
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
    turns.last_mut().unwrap()["items"]
        .as_array_mut()
        .unwrap()
        .push(item)
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
    let store = state.inner.store.lock().await;
    store
        .execute(
            "delete from local_session_sources where share_id=?1",
            [share_id],
        )
        .map_err(LocalError::internal)?;
    Ok(StatusCode::NO_CONTENT)

}).await
}

#[cfg(test)]
mod tests {
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
        let turns = project_jsonl(&codex, "codex-jsonl-v1", false, 4000).unwrap();
        assert_eq!(turns[0]["items"][0]["content"][0]["text"], "question");
        assert_eq!(turns[0]["items"][1]["text"], "answer");
        let flicker = root.join("flicker.jsonl");
        fs::write(&flicker, "{\"type\":\"message\",\"role\":\"user\",\"content\":\"hello\"}\n{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"call-1\",\"name\":\"bash\",\"input\":{\"command\":\"pwd\"}},{\"type\":\"text\",\"text\":\"world\"}]}\n{\"type\":\"message\",\"role\":\"tool\",\"content\":[{\"type\":\"tool-result\",\"toolCallId\":\"call-1\",\"result\":{\"llmContent\":\"/tmp\"}}]}\n").unwrap();
        let turns = project_jsonl(&flicker, "myflicker-jsonl-v1", true, 4000).unwrap();
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
