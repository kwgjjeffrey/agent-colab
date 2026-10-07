//! Files shared-item adapter: native watching, shadow-Git publication, materialization and local browsing.
//!
//! This module owns the complete Files lifecycle. The crate root only wires its routes and shared
//! infrastructure, which keeps Files changes from coupling authentication and Channel handlers.

use super::*;
use axum::body::Body;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use tokio_util::io::ReaderStream;
use wait_timeout::ChildExt;

const JOB_PUBLISH: &str = "publish_files";
const JOB_MATERIALIZE: &str = "materialize_files";
const RECOMMENDED_EXCLUDES: &[&str] = &["node_modules", "target", "dist", "build", ".cache"];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct InspectSourceRequest {
    local_path: String,
    #[serde(default)]
    sync_excludes: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateScopeRequest {
    #[serde(default)]
    sync_excludes: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExcludeCandidate {
    pattern: String,
    file_count: u64,
    byte_size: u64,
    selected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SourceInspection {
    local_path: String,
    included_files: u64,
    included_bytes: u64,
    excluded_files: u64,
    excluded_bytes: u64,
    project_ignore_applied: bool,
    exceeds_transport_limit: bool,
    candidates: Vec<ExcludeCandidate>,
}

struct ScannedFile {
    relative: String,
    bytes: u64,
}

struct LocalJob {
    trace_context: serde_json::Value,
    id: String,
    kind: String,
    share_id: String,
    attempts: i64,
    generation: i64,
}

pub(super) fn start_file_sync(state: &AppState) {
    let watcher_state = state.clone();
    tokio::spawn(async move {
        if let Err(error) = run_file_sync(watcher_state).await {
            eprintln!("Colab file watcher stopped: {error:#}");
        }
    });
    let worker_state = state.clone();
    tokio::spawn(async move { run_job_worker(worker_state).await });
}

/// Persist one logical unit of sync work. Repeated watcher events update the same dedupe row and
/// move its due time, so a burst of editor writes becomes one full shadow-Git scan.
pub(super) async fn enqueue_job(
    state: &AppState,
    kind: &str,
    share_id: &str,
    user_id: &str,
    delay_seconds: i64,
) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.enqueue-job", async {

    let dedupe_key = format!("{kind}:{user_id}:{share_id}");
    let store = state.inner.store.lock().await;
    store.execute(
        "insert into local_jobs(id,dedupe_key,kind,share_id,user_id,state,next_attempt_at,trace_context) values(?1,?2,?3,?4,?5,'pending',unixepoch()+?6,?7) on conflict(dedupe_key) do update set trace_context=coalesce(excluded.trace_context,local_jobs.trace_context),generation=generation+case when excluded.kind like 'publish_%' or state not in ('pending','running') then 1 else 0 end,state=case when state='running' then 'running' else 'pending' end,next_attempt_at=case when excluded.kind like 'materialize_%' and state in ('pending','running') then next_attempt_at else unixepoch()+?6 end,last_error=null,updated_at=current_timestamp,completed_at=null",
        rusqlite::params![Uuid::new_v4().to_string(), dedupe_key, kind, share_id, user_id, delay_seconds, colab_observability::context_json().as_object().map(|_|colab_observability::context_json().to_string())],
    ).map_err(LocalError::internal)?;
    Ok(())

}).await
}

/// Atomically leases one due job. SQLite permits one writer, so the conditional UPDATE is enough
/// to prevent the watcher, GUI and worker from executing the same job concurrently.
async fn claim_job(state: &AppState) -> Result<Option<LocalJob>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.claim-job", async {

    let mut store = state.inner.store.lock().await;
    let tx = store.transaction().map_err(LocalError::internal)?;
    let candidate = tx.query_row(
        "select id,kind,share_id,attempts,generation,trace_context from local_jobs where state in ('pending','failed') and next_attempt_at<=unixepoch() order by next_attempt_at,created_at limit 1",
        [],
        |row| Ok(LocalJob { id: row.get(0)?, kind: row.get(1)?, share_id: row.get(2)?, attempts: row.get(3)?, generation: row.get(4)?, trace_context: row.get::<_, Option<String>>(5)?.and_then(|raw|serde_json::from_str(&raw).ok()).unwrap_or_default() }),
    ).ok();
    let Some(job) = candidate else {
        tx.commit().map_err(LocalError::internal)?;
        return Ok(None);
    };
    let changed = tx.execute(
        "update local_jobs set state='running',attempts=attempts+1,updated_at=current_timestamp where id=?1 and state in ('pending','failed')",
        [&job.id],
    ).map_err(LocalError::internal)?;
    tx.commit().map_err(LocalError::internal)?;
    Ok((changed == 1).then_some(job))

}).await
}

async fn finish_job(state: &AppState, job: &LocalJob, result: &Result<(), LocalError>) {
    let store = state.inner.store.lock().await;
    match result {
        Ok(()) => {
            // If generation advanced while this job ran, another filesystem event arrived. Keep
            // it pending instead of allowing this older snapshot to mark the logical job done.
            let _ = store.execute("update local_jobs set state=case when generation=?2 then 'completed' else 'pending' end,next_attempt_at=case when generation=?2 then next_attempt_at else unixepoch() end,last_error=null,completed_at=case when generation=?2 then current_timestamp else null end,updated_at=current_timestamp where id=?1", rusqlite::params![job.id,job.generation]);
        }
        Err(error) => {
            // 2,4,8… seconds, capped at five minutes. Failed remains observable while the due
            // timestamp makes it automatically retryable; a manual retry simply advances it.
            let delay = 2_i64.pow((job.attempts as u32 + 1).min(8)).min(300);
            let _ = store.execute("update local_jobs set state=case when generation=?4 then 'failed' else 'pending' end,last_error=case when generation=?4 then ?2 else null end,next_attempt_at=case when generation=?4 then unixepoch()+?3 else unixepoch() end,updated_at=current_timestamp where id=?1",rusqlite::params![job.id,error.message,delay,job.generation]);
        }
    }
}

pub(super) async fn wait_for_job(
    state: &AppState,
    kind: &str,
    share_id: &str,
    user_id: &str,
) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.wait-for-job", async {

    let dedupe_key = format!("{kind}:{user_id}:{share_id}");
    for _ in 0..120 {
        let result: Option<(String, Option<String>)> = {
            let store = state.inner.store.lock().await;
            store
                .query_row(
                    "select state,last_error from local_jobs where dedupe_key=?1",
                    [&dedupe_key],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .ok()
        };
        match result {
            Some((state, _)) if state == "completed" => return Ok(()),
            Some((state, error)) if state == "failed" => {
                return Err(LocalError::internal(
                    error.unwrap_or_else(|| "File synchronization failed".into()),
                ));
            }
            None => return Err(LocalError::internal("Local sync job disappeared")),
            _ => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
        }
    }
    Err(LocalError::internal(
        "File synchronization is still running",
    ))

}).await
}

async fn run_job_worker(state: AppState) {
    let mut tick = tokio::time::interval(std::time::Duration::from_millis(500));
    loop {
        tick.tick().await;
        let job = match claim_job(&state).await {
            Ok(Some(job)) => job,
            Ok(None) => continue,
            Err(error) => {
                eprintln!("Cannot claim local sync job: {}", error.message);
                continue;
            }
        };
        let result = colab_observability::resume(&job.trace_context, async { match job.kind.as_str() {
            JOB_PUBLISH => publish_source(&state, &job.share_id).await,
            JOB_MATERIALIZE => sync_materialization(&state, &job.share_id)
                .await
                .map(|_| ()),
            "publish_skill" => skills::publish_source(&state, &job.share_id).await,
            "materialize_skill" => skills::sync_materialization(&state, &job.share_id)
                .await
                .map(|_| ()),
            _ => Err(LocalError::internal("unknown local sync job kind")),
        } }).await;
        finish_job(&state, &job, &result).await;
    }
}

async fn run_file_sync(state: AppState) -> anyhow::Result<()> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.run-file-sync", async {

    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel::<PathBuf>();
    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
            if let Ok(event) = result {
                for path in event.paths {
                    let _ = event_tx.send(path);
                }
            }
        })?;
    let mut watched = HashSet::<PathBuf>::new();
    let mut watched_shares = HashSet::<String>::new();
    let mut active_user: Option<String> = None;
    let mut sources = Vec::<(String, PathBuf)>::new();
    let mut refresh = tokio::time::interval(std::time::Duration::from_secs(5));

    loop {
        tokio::select! {
            _ = refresh.tick() => {
                let user_id = match current_user_id(&state).await {
                    Ok(value) => value,
                    Err(_) => { sources.clear(); continue; }
                };
                if active_user.as_deref() != Some(&user_id) {
                    active_user = Some(user_id.clone());
                    watched_shares.clear();
                }
                let next = {
                    let store = state.inner.store.lock().await;
                    let mut statement = store.prepare("select share_id,source_path from local_file_sources where user_id=?1")?;
                    statement.query_map([user_id.clone()], |row| Ok((row.get::<_,String>(0)?,PathBuf::from(row.get::<_,String>(1)?))))?.filter_map(Result::ok).collect::<Vec<_>>()
                };
                for (share_id, source) in &next {
                    let target = if source.is_dir() { source.clone() } else { source.parent().unwrap_or(source).to_path_buf() };
                    if watched.insert(target.clone()) {
                        watcher.watch(&target, RecursiveMode::Recursive)?;
                    }
                    // A startup/account-switch scan closes the gap left while Local Core was not
                    // running (or while another account was active). Unchanged trees are a cheap
                    // no-op and never create a revision or network upload.
                    if watched_shares.insert(share_id.clone()) {
                        enqueue_job(&state, JOB_PUBLISH, share_id, &user_id, 2).await.map_err(|error| anyhow::anyhow!(error.message))?;
                    }
                }
                sources = next;
            }
            Some(changed_path) = event_rx.recv() => {
                for (share_id, source) in &sources {
                    if changed_path == *source || changed_path.starts_with(source) || (source.is_file() && changed_path.parent() == source.parent()) {
                        // Quiet-period debounce: a save operation commonly emits several native
                        // events. Moving the durable job deadline coalesces them into one scan.
                        if let Some(user_id) = active_user.as_deref() {
                            enqueue_job(&state, JOB_PUBLISH, share_id, user_id, 2).await.map_err(|error| anyhow::anyhow!(error.message))?;
                        }
                    }
                }
            }
        }
    }

}).await
}

pub(super) async fn list_file_shares(
    State(state): State<AppState>,
    AxumPath(channel_id): AxumPath<String>,
) -> Result<Json<Vec<FileShare>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.list-file-shares", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/channels/{channel_id}/files",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let mut shares: Vec<FileShare> = response.json().await.map_err(LocalError::internal)?;
    let user_id = current_user_id(&state).await?;
    let store = state.inner.store.lock().await;
    for share in &mut shares {
        store.execute("insert into file_share_cache(share_id,name,contributor_name,contributor_avatar_url,remote_updated_at) values(?1,?2,?3,?4,?5) on conflict(share_id) do update set name=excluded.name,contributor_name=excluded.contributor_name,contributor_avatar_url=excluded.contributor_avatar_url,remote_updated_at=excluded.remote_updated_at,updated_at=current_timestamp",rusqlite::params![share.id,share.name,share.contributor_name,share.contributor_avatar_url,share.updated_at]).map_err(LocalError::internal)?;
        share.local_path = store
            .query_row(
                "select source_path from local_file_sources where share_id=?1 and user_id=?2",
                [&share.id, &user_id],
                |row| row.get(0),
            )
            .or_else(|_| {
                store.query_row(
                    "select local_path from file_materializations where share_id=?1 and user_id=?2",
                    [&share.id, &user_id],
                    |row| row.get(0),
                )
            })
            .ok();
        let job: Option<(String, Option<String>)> = store.query_row(
            "select state,last_error from local_jobs where share_id=?1 and user_id=?2 order by updated_at desc limit 1",
            [&share.id, &user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok();
        match job {
            Some((state, error)) if state != "completed" => {
                share.sync_state = Some(
                    if state == "failed" {
                        "failed"
                    } else {
                        "syncing"
                    }
                    .into(),
                );
                share.sync_error = error;
            }
            _ => {
                share.sync_state = Some(
                    if share.current_root_oid.is_some() {
                        "ready"
                    } else {
                        "preparing"
                    }
                    .into(),
                )
            }
        }
    }
    Ok(Json(shares))

}).await
}

/// Previews the exact local scope before sharing. Colab-specific excludes are supplied by the
/// caller and remain external to the source tree; project `.gitignore` is consulted read-only.
pub(super) async fn inspect_file_source(
    Json(body): Json<InspectSourceRequest>,
) -> Result<Json<SourceInspection>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.inspect-file-source", async {

    let source = fs::canonicalize(&body.local_path).map_err(LocalError::internal)?;
    inspect_source(&source, &body.sync_excludes).map(Json)

}).await
}

fn inspect_source(source: &Path, sync_excludes: &[String]) -> Result<SourceInspection, LocalError> {
    validate_sync_excludes(sync_excludes)?;
    let files = scan_source_files(&source)?;
    let project_ignored = project_ignored_paths(&source, &files);
    let selected = sync_excludes.iter().cloned().collect::<HashSet<_>>();
    let mut candidate_totals = std::collections::BTreeMap::<String, (u64, u64)>::new();
    let mut included_files = 0;
    let mut included_bytes = 0;
    let mut excluded_files = 0;
    let mut excluded_bytes = 0;
    for file in &files {
        for candidate in RECOMMENDED_EXCLUDES {
            if path_has_component(&file.relative, candidate) {
                let entry = candidate_totals.entry((*candidate).into()).or_default();
                entry.0 += 1;
                entry.1 += file.bytes;
            }
        }
        let excluded = project_ignored.contains(&file.relative)
            || selected
                .iter()
                .any(|pattern| path_has_component(&file.relative, pattern));
        if excluded {
            excluded_files += 1;
            excluded_bytes += file.bytes;
        } else {
            included_files += 1;
            included_bytes += file.bytes;
        }
    }
    let candidates = candidate_totals
        .into_iter()
        .map(|(pattern, (file_count, byte_size))| ExcludeCandidate {
            selected: selected.contains(&pattern),
            pattern,
            file_count,
            byte_size,
        })
        .collect();
    Ok(SourceInspection {
        local_path: source.to_string_lossy().into_owned(),
        included_files,
        included_bytes,
        excluded_files,
        excluded_bytes,
        project_ignore_applied: source.is_dir() && source.join(".gitignore").is_file(),
        exceeds_transport_limit: included_bytes > 200 * 1024 * 1024,
        candidates,
    })
}

pub(super) async fn get_sync_scope(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<Json<SourceInspection>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.get-sync-scope", async {

    let user_id = current_user_id(&state).await?;
    let (source, shadow): (String, String) = {
        let store = state.inner.store.lock().await;
        store.query_row("select source_path,shadow_git_path from local_file_sources where share_id=?1 and user_id=?2",[&share_id,&user_id],|row|Ok((row.get(0)?,row.get(1)?))).map_err(|_|LocalError::bad_request("Only the contributor can change synchronization scope"))?
    };
    let excludes = read_shadow_excludes(Path::new(&shadow))?;
    inspect_source(Path::new(&source), &excludes).map(Json)

}).await
}

pub(super) async fn update_sync_scope(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
    Json(body): Json<UpdateScopeRequest>,
) -> Result<Json<SourceInspection>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.update-sync-scope", async {

    validate_sync_excludes(&body.sync_excludes)?;
    let user_id = current_user_id(&state).await?;
    let (source, shadow): (String, String) = {
        let store = state.inner.store.lock().await;
        store.query_row("select source_path,shadow_git_path from local_file_sources where share_id=?1 and user_id=?2",[&share_id,&user_id],|row|Ok((row.get(0)?,row.get(1)?))).map_err(|_|LocalError::bad_request("Only the contributor can change synchronization scope"))?
    };
    let source = fs::canonicalize(source).map_err(LocalError::internal)?;
    let inspection = inspect_source(&source, &body.sync_excludes)?;
    if inspection.exceeds_transport_limit {
        return Err(LocalError::bad_request(
            "Selected synchronization scope exceeds the current 200 MiB limit",
        ));
    }
    write_shadow_excludes(Path::new(&shadow), &body.sync_excludes)?;
    enqueue_job(&state, JOB_PUBLISH, &share_id, &user_id, 0).await?;
    Ok(Json(inspection))

}).await
}
pub(super) async fn share_local_files(
    State(state): State<AppState>,
    AxumPath(channel_id): AxumPath<String>,
    Json(body): Json<ShareLocalFiles>,
) -> Result<(StatusCode, Json<FileShare>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.share-local-files", async {

    // The source directory always remains the user's working copy. Colab never creates a
    // `.git` directory inside it: all Git metadata lives in the app-owned shadow repository.
    // Keeping that boundary is what prevents Colab snapshots from interfering with a project's
    // own Git repository (or with a directory that is not a Git repository at all).
    let source = fs::canonicalize(&body.local_path).map_err(LocalError::internal)?;
    if !source.is_dir() && !source.is_file() {
        return Err(LocalError::bad_request(
            "Choose a file or directory to share",
        ));
    }
    validate_sync_excludes(&body.sync_excludes)?;
    let name = body
        .name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            source
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Shared files")
                .to_owned()
        });
    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/channels/{channel_id}/files",
            state.inner.server_url
        ))
        .bearer_auth(&token)
        .json(&serde_json::json!({"name":name}))
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let mut share: FileShare = response.json().await.map_err(LocalError::internal)?;
    let shadow = state
        .inner
        .data_root
        .join("shadows")
        .join(format!("{}.git", share.id));
    init_shadow(&shadow, source_work_tree(&source))?;
    write_shadow_excludes(&shadow, &body.sync_excludes)?;
    {
        let user_id = current_user_id(&state).await?;
        let store = state.inner.store.lock().await;
        store.execute("insert into local_file_sources(share_id,channel_id,source_path,shadow_git_path,user_id) values(?1,?2,?3,?4,?5)",rusqlite::params![share.id,channel_id,source.to_string_lossy(),shadow.to_string_lossy(),user_id]).map_err(LocalError::internal)?;
    }
    // First registration is still synchronous from the user's perspective, but it goes through
    // the same durable job path as every later publication. A crash after this point leaves a
    // recoverable pending/running row instead of losing the accepted work.
    let user_id = current_user_id(&state).await?;
    enqueue_job(&state, JOB_PUBLISH, &share.id, &user_id, 0).await?;
    // Registration succeeds once the durable job exists. Publishing can outlive one GUI request;
    // the list reports preparing/syncing/failed instead of inventing a second timeout error.
    share.local_path = Some(source.to_string_lossy().into_owned());
    let shares = list_file_shares(State(state), AxumPath(channel_id))
        .await?
        .0;
    let published = shares
        .into_iter()
        .find(|item| item.id == share.id)
        .unwrap_or(share);
    Ok((StatusCode::CREATED, Json(published)))

}).await
}
pub(super) async fn publish_local_files(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<Json<FileShare>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.publish-local-files", async {

    // The watcher and this explicit endpoint converge on `publish_source`. That function remains
    // the correctness boundary and performs a complete Git index scan, so coalescing or watcher
    // overflow cannot silently omit changes.
    let user_id = current_user_id(&state).await?;
    enqueue_job(&state, JOB_PUBLISH, &share_id, &user_id, 0).await?;
    wait_for_job(&state, JOB_PUBLISH, &share_id, &user_id).await?;
    let channel_id = {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select channel_id from local_file_sources where share_id=?1 and user_id=?2",
                [&share_id, &user_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(LocalError::internal)?
    };
    let shares = list_file_shares(State(state), AxumPath(channel_id))
        .await?
        .0;
    shares
        .into_iter()
        .find(|item| item.id == share_id)
        .map(Json)
        .ok_or_else(|| LocalError::bad_request("Shared files not found"))

}).await
}

pub(super) async fn retry_file_sync(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.retry-file-sync", async {

    let user_id = current_user_id(&state).await?;
    let kind: String = {
        let store = state.inner.store.lock().await;
        store.query_row(
            "select kind from local_jobs where share_id=?1 and user_id=?2 order by updated_at desc limit 1",
            [&share_id, &user_id],
            |row| row.get(0),
        ).map_err(|_| LocalError::bad_request("No failed synchronization to retry"))?
    };
    enqueue_job(&state, &kind, &share_id, &user_id, 0).await?;
    Ok(StatusCode::ACCEPTED)

}).await
}
async fn publish_source(state: &AppState, share_id: &str) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.publish-source", async {

    // Publication protocol:
    // 1. rescan the complete source into the external shadow Git index;
    // 2. compare the resulting tree with the last successfully published commit;
    // 3. create a commit and a full (first revision) or thin (later revision) Git pack;
    // 4. upload the pack with parent_root_oid as a compare-and-swap precondition;
    // 5. advance local last_root_oid only after the server accepts the revision.
    //
    // The server-side CAS is essential: a failed/conflicting upload must never make this client
    // believe that a root was published. See `create_file_revision` in the server persistence
    // crate for the other half of the invariant.
    let user_id = current_user_id(state).await?;
    let (source, shadow, parent): (String, String, Option<String>) = {
        let store = state.inner.store.lock().await;
        store.query_row("select source_path,shadow_git_path,last_root_oid from local_file_sources where share_id=?1 and user_id=?2",[share_id,&user_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).map_err(LocalError::internal)?
    };
    let source = PathBuf::from(source);
    let shadow = PathBuf::from(shadow);
    let work_tree = source_work_tree(&source);
    if let Some(parent) = parent.as_deref() {
        ensure_published_commit(state, share_id, &shadow, work_tree, parent).await?;
    }
    // Rebuild the index from an empty tree every time. For a directory we add the complete tree;
    // for a single-file share we add only that file, so siblings never leak into the snapshot.
    git(&shadow, work_tree, &["read-tree", "--empty"])?;
    if source.is_dir() {
        git(&shadow, work_tree, &["add", "-A", "--", "."])?;
    } else {
        let pathspec = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| LocalError::bad_request("Shared file name is not valid UTF-8"))?;
        git(&shadow, work_tree, &["add", "-A", "--", pathspec])?;
    }
    validate_indexed_payload(&shadow, work_tree)?;
    let tree = git_text(&shadow, work_tree, &["write-tree"])?;
    if let Some(parent) = parent.as_deref() {
        let previous_tree = git_text(
            &shadow,
            work_tree,
            &["rev-parse", &format!("{parent}^{{tree}}")],
        )?;
        if tree == previous_tree {
            return Ok(());
        }
    }
    let mut command = git_command(&shadow, work_tree);
    command.args(["commit-tree", tree.as_str()]);
    if let Some(parent) = parent.as_deref() {
        command.args(["-p", parent]);
    }
    command
        .env("GIT_AUTHOR_NAME", "Colab")
        .env("GIT_AUTHOR_EMAIL", "local@agent-colab")
        .env("GIT_COMMITTER_NAME", "Colab")
        .env("GIT_COMMITTER_EMAIL", "local@agent-colab")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    let mut child = command.spawn().map_err(LocalError::internal)?;
    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"Colab file snapshot\n")
        .map_err(LocalError::internal)?;
    let output = wait_with_output_timeout(child, std::time::Duration::from_secs(120))?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    let root = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let mut pack_command = git_command(&shadow, work_tree);
    pack_command.args(["pack-objects", "--stdout", "--revs"]);
    if parent.is_some() {
        // Later revisions omit objects reachable from the parent. The receiver reconstructs the
        // pack against objects imported from earlier revisions with `index-pack --fix-thin`.
        pack_command.arg("--thin");
    }
    pack_command.stdin(Stdio::piped()).stdout(Stdio::piped());
    let mut child = pack_command.spawn().map_err(LocalError::internal)?;
    {
        let input = child.stdin.as_mut().unwrap();
        writeln!(input, "{root}").map_err(LocalError::internal)?;
        if let Some(parent) = parent.as_deref() {
            writeln!(input, "^{parent}").map_err(LocalError::internal)?;
        }
    }
    let output = child.wait_with_output().map_err(LocalError::internal)?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    let token = access_token(state).await?;
    let mut request = state
        .inner
        .http
        .post(format!(
            "{}/v1/files/{share_id}/revisions",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .query(&[("rootOid", root.as_str())]);
    if let Some(parent) = parent.as_deref() {
        request = request.query(&[("parentRootOid", parent)]);
    }
    let response = request
        .header("content-type", "application/x-git-packed-objects")
        .body(output.stdout)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let _: FileRevision = response.json().await.map_err(LocalError::internal)?;
    let store = state.inner.store.lock().await;
    let changed=store.execute("update local_file_sources set last_root_oid=?3,updated_at=current_timestamp where share_id=?1 and user_id=?2",[share_id,&user_id,&root]).map_err(LocalError::internal)?;
    if changed != 1 {
        return Err(LocalError::internal(
            "local file source disappeared during publish",
        ));
    }
    // SQLite records which root the Server accepted; the ref makes the same commit reachable to
    // Git maintenance. Without it, `git gc` may delete the parent and break the next thin pack.
    git(
        &shadow,
        work_tree,
        &["update-ref", "refs/colab/published", &root],
    )?;
    Ok(())

}).await
}

async fn ensure_published_commit(
    state: &AppState,
    share_id: &str,
    shadow: &Path,
    work_tree: &Path,
    parent: &str,
) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.ensure-published-commit", async {

    if git(
        shadow,
        work_tree,
        &["cat-file", "-e", &format!("{parent}^{{commit}}")],
    )
    .is_ok()
    {
        git(
            shadow,
            work_tree,
            &["update-ref", "refs/colab/published", parent],
        )?;
        return Ok(());
    }
    // A missing parent can follow cache cleanup or interrupted installation. The accepted Server
    // pack chain is authoritative, so recover objects instead of resetting the CAS cursor.
    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/files/{share_id}/revisions",
            state.inner.server_url
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let revisions: Vec<FileRevision> = response.json().await.map_err(LocalError::internal)?;
    for revision in revisions {
        let response = state
            .inner
            .http
            .get(format!(
                "{}/v1/file-revisions/{}/content",
                state.inner.server_url, revision.id
            ))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        let pack = response.bytes().await.map_err(LocalError::internal)?;
        let mut command = Command::new("git");
        command
            .arg(format!("--git-dir={}", shadow.display()))
            .args(["index-pack", "--stdin", "--fix-thin"])
            .stdin(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn().map_err(LocalError::internal)?;
        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(&pack)
            .map_err(LocalError::internal)?;
        let output = child.wait_with_output().map_err(LocalError::internal)?;
        if !output.status.success() {
            return Err(LocalError::internal(String::from_utf8_lossy(
                &output.stderr,
            )));
        }
    }
    git(
        shadow,
        work_tree,
        &["cat-file", "-e", &format!("{parent}^{{commit}}")],
    )?;
    git(
        shadow,
        work_tree,
        &["update-ref", "refs/colab/published", parent],
    )

}).await
}
pub(super) async fn materialize_file_share(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<FileShare>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.materialize-file-share", async {

    let user_id = current_user_id(&state).await?;
    let cached = cached_materialization(&state, &share_id, &user_id).await;
    enqueue_job(&state, JOB_MATERIALIZE, &share_id, &user_id, 0).await?;
    let wait_for_refresh = query.get("wait").is_some_and(|value| value == "true");
    if let Some(mut share) = cached.filter(|_| !wait_for_refresh) {
        // Stale-while-revalidate: an existing snapshot is immediately usable. The durable worker
        // refreshes it in the background; browsing never waits for the network.
        share.sync_state = Some("syncing".into());
        activity::record_read(&state, &share_id, &user_id).await;
        return Ok(Json(share));
    }
    wait_for_job(&state, JOB_MATERIALIZE, &share_id, &user_id).await?;
    let share = cached_materialization(&state, &share_id, &user_id)
        .await
        .map(Json)
        .ok_or_else(|| LocalError::internal("Materialization completed without a local snapshot"))?;
    activity::record_read(&state, &share_id, &user_id).await;
    Ok(share)

}).await
}

async fn cached_materialization(
    state: &AppState,
    share_id: &str,
    user_id: &str,
) -> Option<FileShare> {
    let store = state.inner.store.lock().await;
    let (local_path, root_oid): (String, String) = store.query_row(
        "select local_path,last_root_oid from file_materializations where share_id=?1 and user_id=?2",
        [share_id, user_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).ok()?;
    if !Path::new(&local_path).exists() {
        return None;
    }
    let (name, contributor_name, contributor_avatar_url, updated_at) = store
        .query_row(
            "select name,contributor_name,contributor_avatar_url,remote_updated_at from file_share_cache where share_id=?1",
            [share_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap_or_else(|_| ("Shared files".into(), "Channel member".into(), None, String::new()));
    Some(FileShare {
        contributor_member_id: None,
        id: share_id.into(),
        channel_id: String::new(),
        name,
        contributor_name,
        contributor_avatar_url,
        state: "active".into(),
        current_root_oid: Some(root_oid),
        can_withdraw: false,
        updated_at,
        local_path: Some(local_path),
        sync_state: Some("ready".into()),
        sync_error: None,
    })
}

async fn sync_materialization(state: &AppState, share_id: &str) -> Result<FileShare, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.sync-materialization", async {

    // Consumer-side synchronization replays the revision chain into an app-owned bare Git
    // repository, then checks out the latest root into a separate materialized directory. It
    // never writes into another member's source directory. The first implementation downloads
    // the complete chain on each request; missing-object negotiation is a planned optimization.
    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/files/{share_id}/revisions",
            state.inner.server_url
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let revisions: Vec<FileRevision> = response.json().await.map_err(LocalError::internal)?;
    let latest = revisions
        .last()
        .ok_or_else(|| LocalError::bad_request("No file snapshot has been published"))?;
    let repo = state
        .inner
        .data_root
        .join("materialized-repos")
        .join(format!("{share_id}.git"));
    let (display_name, contributor_name): (String, String) = {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select name,contributor_name from file_share_cache where share_id=?1",
                [&share_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or_else(|_| {
                (
                    format!("shared-files-{}", &share_id[..8]),
                    "Channel member".into(),
                )
            })
    };
    let target = state
        .inner
        .data_root
        .join("materialized")
        .join(safe_path_component(&contributor_name))
        .join(safe_path_component(&display_name));
    let previous_target = {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select local_path from file_materializations where share_id=?1",
                [&share_id],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .map(PathBuf::from)
    };
    if let Some(previous) = previous_target {
        if previous != target && previous.exists() && !target.exists() {
            fs::create_dir_all(target.parent().unwrap()).map_err(LocalError::internal)?;
            fs::rename(previous, &target).map_err(LocalError::internal)?;
        }
    }
    if !repo.exists() {
        fs::create_dir_all(repo.parent().unwrap()).map_err(LocalError::internal)?;
        let status = Command::new("git")
            .args(["init", "--bare", repo.to_string_lossy().as_ref()])
            .status()
            .map_err(LocalError::internal)?;
        if !status.success() {
            return Err(LocalError::internal(
                "initialize materialized Git repository",
            ));
        }
    }
    for revision in &revisions {
        let response = state
            .inner
            .http
            .get(format!(
                "{}/v1/file-revisions/{}/content",
                state.inner.server_url, revision.id
            ))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        let pack = response.bytes().await.map_err(LocalError::internal)?;
        let mut command = Command::new("git");
        command
            .arg(format!("--git-dir={}", repo.display()))
            .args(["index-pack", "--stdin", "--fix-thin"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        let mut child = command.spawn().map_err(LocalError::internal)?;
        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(&pack)
            .map_err(LocalError::internal)?;
        let output = child.wait_with_output().map_err(LocalError::internal)?;
        if !output.status.success() {
            return Err(LocalError::internal(String::from_utf8_lossy(
                &output.stderr,
            )));
        }
    }
    let tree = git_text(&repo, &target, &["ls-tree", "-rz", "--full-tree", &latest.root_oid])?;
    validate_materialized_tree(&tree)?;
    fs::create_dir_all(&target).map_err(LocalError::internal)?;
    git(
        &repo,
        &target,
        &["read-tree", "--reset", "-u", &latest.root_oid],
    )?;
    {
        let user_id = current_user_id(&state).await?;
        let store = state.inner.store.lock().await;
        store.execute("insert into file_materializations(share_id,local_path,last_root_oid,user_id) values(?1,?2,?3,?4) on conflict(share_id) do update set local_path=excluded.local_path,last_root_oid=excluded.last_root_oid,user_id=excluded.user_id,updated_at=current_timestamp",rusqlite::params![share_id,target.to_string_lossy(),latest.root_oid,user_id]).map_err(LocalError::internal)?;
    }
    let mut share = FileShare {
        contributor_member_id: None,
        id: share_id.to_owned(),
        channel_id: String::new(),
        name: String::new(),
        contributor_name: String::new(),
        contributor_avatar_url: None,
        state: "active".into(),
        current_root_oid: Some(latest.root_oid.clone()),
        can_withdraw: false,
        updated_at: latest.created_at.clone(),
        local_path: Some(target.to_string_lossy().into_owned()),
        sync_state: Some("ready".into()),
        sync_error: None,
    };
    share.local_path = Some(target.to_string_lossy().into_owned());
    share.sync_state = Some("ready".into());
    share.sync_error = None;
    Ok(share)

}).await
}
pub(super) async fn withdraw_file_share(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.withdraw-file-share", async {

    withdraw_remote(&state, &share_id).await?;
    let user_id = current_user_id(&state).await?;
    let store = state.inner.store.lock().await;
    store
        .execute(
            "delete from local_file_sources where share_id=?1 and user_id=?2",
            [&share_id, &user_id],
        )
        .map_err(LocalError::internal)?;
    Ok(StatusCode::NO_CONTENT)

}).await
}
pub(super) async fn list_local_file_tree(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<Json<Vec<LocalFileEntry>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.list-local-file-tree", async {

    let root = local_file_root(&state, &share_id).await?;
    let mut entries = Vec::new();
    if root.is_file() {
        let metadata = fs::metadata(&root).map_err(LocalError::internal)?;
        entries.push(LocalFileEntry {
            path: root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("file")
                .to_owned(),
            name: root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("file")
                .to_owned(),
            kind: "file".into(),
            size: metadata.len(),
        });
    } else {
        collect_entries(&root, &root, &mut entries)?;
    }
    Ok(Json(entries))

}).await
}
pub(super) async fn read_local_file_content(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<LocalFileContent>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.read-local-file-content", async {

    let root = local_file_root(&state, &share_id).await?;
    let relative = query
        .get("path")
        .ok_or_else(|| LocalError::bad_request("Missing file path"))?;
    let candidate = resolve_local_file(&root, relative)?;
    let metadata = fs::metadata(&candidate).map_err(LocalError::internal)?;
    if metadata.len() > 1024 * 1024 {
        return Err(LocalError::bad_request("File is too large to preview"));
    }
    let content = fs::read_to_string(&candidate)
        .map_err(|_| LocalError::bad_request("This file is not a UTF-8 text file"))?;
    Ok(Json(LocalFileContent {
        path: relative.clone(),
        content,
    }))

}).await
}

/// Stream a local materialization to the authenticated loopback client. Browser-native previews
/// (PDF/images) can consume this without buffering the file in Local Core; format-specific Office
/// renderers still impose their own client-side size limit before parsing an ArrayBuffer.
pub(super) async fn stream_local_file_content(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Response, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.stream-local-file-content", async {

    let root = local_file_root(&state, &share_id).await?;
    let relative = query
        .get("path")
        .ok_or_else(|| LocalError::bad_request("Missing file path"))?;
    let candidate = resolve_local_file(&root, relative)?;
    let file = tokio::fs::File::open(&candidate)
        .await
        .map_err(LocalError::internal)?;
    let content_type = mime_guess::from_path(&candidate)
        .first_or_octet_stream()
        .to_string();
    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_owned()),
        ],
        Body::from_stream(ReaderStream::new(file)),
    )
        .into_response())

}).await
}

/// Resolve a requested relative path without allowing a materialized-tree escape. Single-file
/// shares deliberately accept only their displayed file name.
fn resolve_local_file(root: &Path, relative: &str) -> Result<PathBuf, LocalError> {
    let candidate = if root.is_file() {
        if root.file_name().and_then(|value| value.to_str()) != Some(relative) {
            return Err(LocalError::bad_request("Invalid file path"));
        }
        root.to_owned()
    } else {
        fs::canonicalize(root.join(relative)).map_err(LocalError::internal)?
    };
    if (!root.is_file() && !candidate.starts_with(root)) || !candidate.is_file() {
        return Err(LocalError::bad_request("Invalid file path"));
    }
    Ok(candidate)
}
async fn local_file_root(state: &AppState, share_id: &str) -> Result<PathBuf, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.local-file-root", async {

    let user_id = current_user_id(state).await?;
    let store = state.inner.store.lock().await;
    let value: String = store
        .query_row(
            "select source_path from local_file_sources where share_id=?1 and user_id=?2",
            [share_id, &user_id],
            |row| row.get(0),
        )
        .or_else(|_| {
            store.query_row(
                "select local_path from file_materializations where share_id=?1 and user_id=?2",
                [share_id, &user_id],
                |row| row.get(0),
            )
        })
        .map_err(|_| LocalError::bad_request("Sync these shared files to this device first"))?;
    fs::canonicalize(value).map_err(LocalError::internal)

}).await
}
fn collect_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<LocalFileEntry>,
) -> Result<(), LocalError> {
    if entries.len() >= 5000 {
        return Err(LocalError::bad_request(
            "This folder contains too many entries to browse",
        ));
    }
    let mut children = fs::read_dir(current)
        .map_err(LocalError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(LocalError::internal)?;
    children.sort_by_key(|entry| entry.file_name());
    for child in children {
        let path = child.path();
        let metadata = child.metadata().map_err(LocalError::internal)?;
        let relative = path
            .strip_prefix(root)
            .map_err(LocalError::internal)?
            .to_string_lossy()
            .replace('\\', "/");
        if relative == ".git" || relative.starts_with(".git/") {
            continue;
        }
        let is_dir = metadata.is_dir();
        entries.push(LocalFileEntry {
            path: relative,
            name: child.file_name().to_string_lossy().into_owned(),
            kind: if is_dir {
                "directory".into()
            } else {
                "file".into()
            },
            size: metadata.len(),
        });
        if is_dir {
            collect_entries(root, &path, entries)?;
        }
    }
    Ok(())
}
async fn withdraw_remote(state: &AppState, share_id: &str) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.files.withdraw-remote", async {

    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .delete(format!("{}/v1/files/{share_id}", state.inner.server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(())

}).await
}
fn source_work_tree(source: &Path) -> &Path {
    if source.is_dir() {
        source
    } else {
        source.parent().unwrap_or_else(|| Path::new("."))
    }
}

pub(super) fn safe_path_component(value: &str) -> String {
    let result = value
        .chars()
        .map(|character| {
            if character.is_control() || matches!(character, '/' | '\\' | ':') {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim()
        .to_owned();
    if result.is_empty() {
        "Shared files".into()
    } else {
        result
    }
}

pub(super) fn init_shadow(repo: &Path, work_tree: &Path) -> Result<(), LocalError> {
    if repo.exists() {
        return Ok(());
    }
    fs::create_dir_all(repo.parent().unwrap()).map_err(LocalError::internal)?;
    let output = Command::new("git")
        .args(["init", "--bare", repo.to_string_lossy().as_ref()])
        .output()
        .map_err(LocalError::internal)?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    git(repo, work_tree, &["config", "core.bare", "false"])?;
    git(
        repo,
        work_tree,
        &[
            "config",
            "core.worktree",
            work_tree.to_string_lossy().as_ref(),
        ],
    )?;
    git(repo, work_tree, &["config", "core.autocrlf", "false"])
}

fn validate_sync_excludes(patterns: &[String]) -> Result<(), LocalError> {
    if patterns
        .iter()
        .any(|pattern| !RECOMMENDED_EXCLUDES.contains(&pattern.as_str()))
    {
        return Err(LocalError::bad_request(
            "Unsupported synchronization exclusion",
        ));
    }
    Ok(())
}

/// The generated exclude file belongs to the shadow repository. It must never be written into
/// the contributor's source directory or source `.git`, because Colab policy is device-local.
fn write_shadow_excludes(repo: &Path, patterns: &[String]) -> Result<(), LocalError> {
    let info = repo.join("info");
    fs::create_dir_all(&info).map_err(LocalError::internal)?;
    let mut body = String::from("# Generated by Agent Colab; source files are never modified.\n");
    for pattern in patterns {
        body.push_str(pattern);
        body.push_str("/\n");
    }
    fs::write(info.join("exclude"), body).map_err(LocalError::internal)
}

/// Creates one self-contained Git pack for a fixed Files or Skill snapshot.
///
/// Quick Share uses a full pack because it has no prior revision chain. Keeping the pack producer
/// beside the normal shadow-Git implementation preserves the same exclude, single-file and size
/// invariants instead of inventing a second archive format for temporary transfers.
pub(super) fn create_full_snapshot_pack(
    source: &Path,
    shadow: &Path,
    pack_path: &Path,
    excludes: &[String],
    commit_message: &str,
) -> Result<String, LocalError> {
    let work_tree = source_work_tree(source);
    init_shadow(shadow, work_tree)?;
    write_shadow_excludes(shadow, excludes)?;
    git(shadow, work_tree, &["read-tree", "--empty"])?;
    if source.is_dir() {
        git(shadow, work_tree, &["add", "-A", "--", "."])?;
    } else {
        let pathspec = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| LocalError::bad_request("Shared file name is not valid UTF-8"))?;
        git(shadow, work_tree, &["add", "-A", "--", pathspec])?;
    }
    validate_indexed_payload(shadow, work_tree)?;
    let tree = git_text(shadow, work_tree, &["write-tree"])?;
    let mut commit = git_command(shadow, work_tree);
    commit
        .args(["commit-tree", tree.as_str()])
        .env("GIT_AUTHOR_NAME", "Colab")
        .env("GIT_AUTHOR_EMAIL", "local@agent-colab")
        .env("GIT_COMMITTER_NAME", "Colab")
        .env("GIT_COMMITTER_EMAIL", "local@agent-colab")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    let mut child = commit.spawn().map_err(LocalError::internal)?;
    child
        .stdin
        .as_mut()
        .expect("piped commit input")
        .write_all(commit_message.as_bytes())
        .map_err(LocalError::internal)?;
    let output = wait_with_output_timeout(child, std::time::Duration::from_secs(120))?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    let root = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if let Some(parent) = pack_path.parent() {
        fs::create_dir_all(parent).map_err(LocalError::internal)?;
    }
    let pack_file = fs::File::create(pack_path).map_err(LocalError::internal)?;
    let mut pack = git_command(shadow, work_tree);
    pack.args(["pack-objects", "--stdout", "--revs"])
        .stdin(Stdio::piped())
        .stdout(Stdio::from(pack_file))
        .stderr(Stdio::piped());
    let mut child = pack.spawn().map_err(LocalError::internal)?;
    writeln!(child.stdin.as_mut().expect("piped pack input"), "{root}")
        .map_err(LocalError::internal)?;
    let output = wait_with_output_timeout(child, std::time::Duration::from_secs(120))?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    Ok(root)
}

/// Read Colab's synchronization scope from Git's repository-local exclude file. This file is the
/// sole source of truth for excludes; SQLite only locates the shadow repository. Unknown entries
/// are ignored by the current GUI but remain Git-effective until the user explicitly saves scope.
fn read_shadow_excludes(repo: &Path) -> Result<Vec<String>, LocalError> {
    let path = repo.join("info/exclude");
    let body = match fs::read_to_string(path) {
        Ok(body) => body,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(LocalError::internal(error)),
    };
    Ok(body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| line.trim_end_matches('/').to_owned())
        .filter(|pattern| RECOMMENDED_EXCLUDES.contains(&pattern.as_str()))
        .collect())
}

fn scan_source_files(source: &Path) -> Result<Vec<ScannedFile>, LocalError> {
    if source.is_file() {
        return Ok(vec![ScannedFile {
            relative: source
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| LocalError::bad_request("File name is not valid UTF-8"))?
                .into(),
            bytes: fs::metadata(source).map_err(LocalError::internal)?.len(),
        }]);
    }
    let mut result = Vec::new();
    scan_directory(source, source, &mut result)?;
    Ok(result)
}

fn scan_directory(
    root: &Path,
    current: &Path,
    result: &mut Vec<ScannedFile>,
) -> Result<(), LocalError> {
    for entry in fs::read_dir(current).map_err(LocalError::internal)? {
        let entry = entry.map_err(LocalError::internal)?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(LocalError::internal)?;
        let relative = path
            .strip_prefix(root)
            .map_err(LocalError::internal)?
            .to_string_lossy()
            .replace('\\', "/");
        if relative == ".git" || relative.starts_with(".git/") || file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            scan_directory(root, &path, result)?;
        } else if file_type.is_file() {
            result.push(ScannedFile {
                relative,
                bytes: entry.metadata().map_err(LocalError::internal)?.len(),
            });
        }
    }
    Ok(())
}

fn project_ignored_paths(source: &Path, files: &[ScannedFile]) -> HashSet<String> {
    let work_tree = if source.is_dir() {
        source
    } else {
        source.parent().unwrap_or_else(|| Path::new("."))
    };
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(work_tree)
        .args(["check-ignore", "--no-index", "-z", "--stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let Ok(mut child) = command.spawn() else {
        return HashSet::new();
    };
    if let Some(stdin) = child.stdin.as_mut() {
        for file in files {
            if stdin.write_all(file.relative.as_bytes()).is_err() || stdin.write_all(&[0]).is_err()
            {
                return HashSet::new();
            }
        }
    }
    let Ok(output) = child.wait_with_output() else {
        return HashSet::new();
    };
    if !output.status.success() && output.status.code() != Some(1) {
        return HashSet::new();
    }
    output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .filter_map(|path| std::str::from_utf8(path).ok().map(ToOwned::to_owned))
        .collect()
}

fn path_has_component(relative: &str, component: &str) -> bool {
    relative.split('/').any(|part| part == component)
}

#[cfg(test)]
mod job_tests {
    use super::*;

    fn test_state() -> (AppState, PathBuf) {
        let root = std::env::temp_dir().join(format!("colab-local-jobs-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let credentials = root.join("google.json");
        fs::write(&credentials, r#"{"installed":{"client_id":"test","client_secret":"test","auth_uri":"https://example.test/auth","token_uri":"https://example.test/token","redirect_uris":["http://localhost"]}}"#).unwrap();
        let state = AppState::load(
            credentials,
            root.join("colab.sqlite"),
            "http://localhost/callback".into(),
            "http://127.0.0.1:1".into(),
        )
        .unwrap();
        (state, root)
    }

    #[tokio::test]
    async fn dedupe_preserves_an_event_arriving_while_a_job_runs() {
        let (state, root) = test_state();
        enqueue_job(&state, JOB_PUBLISH, "share", "user", 0)
            .await
            .unwrap();
        enqueue_job(&state, JOB_PUBLISH, "share", "user", 0)
            .await
            .unwrap();
        let first = claim_job(&state).await.unwrap().unwrap();
        enqueue_job(&state, JOB_PUBLISH, "share", "user", 0)
            .await
            .unwrap();
        finish_job(&state, &first, &Ok(())).await;
        let second = claim_job(&state).await.unwrap();
        assert!(
            second.is_some(),
            "new event must remain pending after the old generation finishes"
        );
        drop(state);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn startup_recovers_a_running_job() {
        let (state, root) = test_state();
        enqueue_job(&state, JOB_PUBLISH, "share", "user", 0)
            .await
            .unwrap();
        assert!(claim_job(&state).await.unwrap().is_some());
        let credentials = root.join("google.json");
        drop(state);
        let recovered = AppState::load(
            credentials,
            root.join("colab.sqlite"),
            "http://localhost/callback".into(),
            "http://127.0.0.1:1".into(),
        )
        .unwrap();
        assert!(claim_job(&recovered).await.unwrap().is_some());
        drop(recovered);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn durable_job_context_survives_restart_and_untraced_coalescing() {
        let (state, root) = test_state();
        enqueue_job(&state, JOB_PUBLISH, "share", "user", 0).await.unwrap();
        let envelope=serde_json::json!({"version":1,"traceparent":"00-11111111111111111111111111111111-2222222222222222-01","entryId":"files.share"});
        state.inner.store.lock().await.execute("update local_jobs set trace_context=?1",[envelope.to_string()]).unwrap();
        // A watcher bump has no user context and must retain the durable initiating envelope.
        enqueue_job(&state, JOB_PUBLISH, "share", "user", 0).await.unwrap();
        let leased=claim_job(&state).await.unwrap().unwrap();
        assert_eq!(leased.trace_context,envelope);
        drop(state);
        let recovered=AppState::load(root.join("google.json"),root.join("colab.sqlite"),"http://localhost/callback".into(),"http://127.0.0.1:1".into()).unwrap();
        let retried=claim_job(&recovered).await.unwrap().unwrap();
        assert_eq!(retried.trace_context,envelope);
        assert_eq!(retried.id,leased.id);
        drop(recovered);fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn failure_is_visible_and_retryable_with_backoff() {
        let (state, root) = test_state();
        enqueue_job(&state, JOB_PUBLISH, "share", "user", 0)
            .await
            .unwrap();
        let job = claim_job(&state).await.unwrap().unwrap();
        finish_job(&state, &job, &Err(LocalError::internal("offline"))).await;
        {
            let store = state.inner.store.lock().await;
            let (status, error, delayed): (String, String, bool) = store.query_row(
                "select state,last_error,next_attempt_at>unixepoch() from local_jobs where id=?1",
                [&job.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            ).unwrap();
            assert_eq!(status, "failed");
            assert_eq!(error, "offline");
            assert!(delayed);
        }
        enqueue_job(&state, JOB_PUBLISH, "share", "user", 0)
            .await
            .unwrap();
        assert!(
            claim_job(&state).await.unwrap().is_some(),
            "manual retry must advance a failed job"
        );
        drop(state);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn synchronization_excludes_live_only_in_the_shadow_repository() {
        let root = std::env::temp_dir().join(format!("colab-file-scope-{}", Uuid::new_v4()));
        let source = root.join("source");
        let shadow = root.join("shadow.git");
        fs::create_dir_all(source.join("dist")).unwrap();
        fs::write(source.join("keep.txt"), "keep").unwrap();
        fs::write(source.join("dist/generated.bin"), "generated").unwrap();
        init_shadow(&shadow, &source).unwrap();
        write_shadow_excludes(&shadow, &["dist".into()]).unwrap();
        let database = rusqlite::Connection::open_in_memory().unwrap();
        database
            .execute_batch("create table local_file_sources(share_id text primary key,source_path text not null,shadow_git_path text not null)")
            .unwrap();
        let columns = database
            .prepare("pragma table_info(local_file_sources)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(!columns.iter().any(|column| column == "sync_excludes"));
        assert!(!source.join(".gitignore").exists());
        assert!(
            fs::read_to_string(shadow.join("info/exclude"))
                .unwrap()
                .contains("dist/")
        );
        assert_eq!(read_shadow_excludes(&shadow).unwrap(), vec!["dist"]);
        git(&shadow, &source, &["add", "-A", "--", "."]).unwrap();
        let indexed = git_text(&shadow, &source, &["ls-files"]).unwrap();
        assert_eq!(indexed, "keep.txt");
        fs::remove_dir_all(root).unwrap();
    }
}
pub(super) fn git_command(repo: &Path, work_tree: &Path) -> Command {
    let mut command = Command::new("git");
    command
        .arg(format!("--git-dir={}", repo.display()))
        .arg(format!("--work-tree={}", work_tree.display()));
    command
}
pub(super) fn git(repo: &Path, work_tree: &Path, args: &[&str]) -> Result<(), LocalError> {
    let output = git_command(repo, work_tree)
        .args(args)
        .output()
        .map_err(LocalError::internal)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )))
    }
}
pub(super) fn git_text(repo: &Path, work_tree: &Path, args: &[&str]) -> Result<String, LocalError> {
    let output = git_command(repo, work_tree)
        .args(args)
        .output()
        .map_err(LocalError::internal)?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

/// The current transport is one opaque HTTP Git pack and the Server accepts at most 256 MiB.
/// Reject impossible work before `pack-objects` consumes minutes of CPU or buffers gigabytes in
/// Local Core memory. Chunked/resumable blob upload can raise this ceiling in a later transport.
fn validate_indexed_payload(repo: &Path, work_tree: &Path) -> Result<(), LocalError> {
    const MAX_TOTAL: u64 = 200 * 1024 * 1024;
    const MAX_FILE: u64 = 100 * 1024 * 1024;
    let output = git_command(repo, work_tree)
        .args(["ls-files", "-z"])
        .output()
        .map_err(LocalError::internal)?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    let mut total = 0_u64;
    for raw in output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
    {
        let relative = std::str::from_utf8(raw)
            .map_err(|_| LocalError::bad_request("A shared path is not valid UTF-8"))?;
        let size = fs::metadata(work_tree.join(relative))
            .map_err(LocalError::internal)?
            .len();
        if size > MAX_FILE {
            return Err(LocalError::bad_request(format!(
                "Shared file is larger than 100 MiB: {relative}. Exclude it or share a narrower source."
            )));
        }
        total = total.saturating_add(size);
        if total > MAX_TOTAL {
            return Err(LocalError::bad_request(
                "Shared content is larger than the current 200 MiB transport limit. Exclude build artifacts or share a narrower source.",
            ));
        }
    }
    Ok(())
}

fn wait_with_output_timeout(
    mut child: std::process::Child,
    timeout: std::time::Duration,
) -> Result<std::process::Output, LocalError> {
    match child.wait_timeout(timeout).map_err(LocalError::internal)? {
        Some(_) => child.wait_with_output().map_err(LocalError::internal),
        None => {
            let _ = child.kill();
            let _ = child.wait();
            Err(LocalError::internal(
                "Git metadata generation exceeded 120 seconds and was cancelled",
            ))
        }
    }
}

// Git is the transport validator, but its checkout intentionally supports symlinks.
// Shared contexts must be self-contained: reject links and escaping paths before checkout.
fn validate_materialized_tree(tree: &str) -> Result<(), LocalError> {
    for entry in tree.split('\0').filter(|e| !e.is_empty()) {
        let (meta, name) = entry.split_once('\t').ok_or_else(|| LocalError::bad_request("Invalid shared file tree"))?;
        let mode = meta.split_whitespace().next().unwrap_or_default();
        if !matches!(mode, "100644" | "100755") || name.split('/').any(|p| matches!(p, "" | "." | ".." | ".git")) || name.contains('\\') {
            return Err(LocalError::bad_request("Unsafe path or link in shared file tree"));
        }
    }
    Ok(())
}
#[cfg(test)] mod hostile_tree_tests {
    #[test] fn rejects_escape_and_link_before_checkout() {
        assert!(super::validate_materialized_tree("120000 blob oid\tlink\0").is_err());
        assert!(super::validate_materialized_tree("100644 blob oid\t../sentinel\0").is_err());
        assert!(super::validate_materialized_tree("100644 blob oid\tnested/file.txt\0").is_ok());
    }
}
