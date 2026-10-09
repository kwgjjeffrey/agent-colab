//! Shared Skill adapter: source discovery, shadow-Git transport and managed Agent installation.
//!
//! A discovered Agent Skill and a developer-selected Skill directory are the same persisted
//! `source_path`. Discovery only reduces selection effort. The shadow Git commit OID is the one
//! shared version identity; installation receipts never introduce a second version scheme.

use super::*;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashSet},
    time::{SystemTime, UNIX_EPOCH},
};

const JOB_PUBLISH: &str = "publish_skill";
const JOB_MATERIALIZE: &str = "materialize_skill";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SkillShare {
    id: String,
    channel_id: String,
    name: String,
    description: Option<String>,
    contributor_name: String,
    contributor_avatar_url: Option<String>,
    state: String,
    current_root_oid: Option<String>,
    can_withdraw: bool,
    updated_at: String,
    #[serde(default)]
    local_path: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SkillSource {
    source_id: String,
    source_path: String,
    name: String,
    description: Option<String>,
    discovered_targets: Vec<String>,
    last_changed_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SourceQuery {
    query: Option<String>,
    recent_hours: Option<i64>,
    channel_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ShareSkill {
    source_id: Option<String>,
    source_path: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Installation {
    target_agent: String,
    state: String,
    installed_path: Option<String>,
    installed_root_oid: Option<String>,
    current_root_oid: Option<String>,
    activation: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Revision {
    id: String,
    root_oid: String,
}

pub(super) fn start_skill_sync(state: &AppState) {
    let state = state.clone();
    tokio::spawn(async move {
        if let Err(error) = run_skill_sync(state).await {
            eprintln!("Colab Skill watcher stopped: {error:#}")
        }
    });
}

/// Native events are hints. A complete catalog fingerprint and shadow-Git scan remain the
/// correctness boundary, so missed/coalesced events are recovered by periodic discovery.
async fn run_skill_sync(state: AppState) -> anyhow::Result<()> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.run-skill-sync", async {

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<PathBuf>();
    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            if let Ok(event) = event {
                for path in event.paths {
                    let _ = tx.send(path);
                }
            }
        })?;
    let mut watched = HashSet::new();
    for (_, root) in target_roots() {
        if root.exists() && watched.insert(root.clone()) {
            watcher.watch(&root, RecursiveMode::Recursive)?;
        }
    }
    refresh_catalog(&state).await?;
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(30));
    loop {
        tokio::select! {
            _=tick.tick()=>{ refresh_catalog(&state).await?; enqueue_changed_sources(&state,None).await?; }
            Some(path)=rx.recv()=>{
                // A short quiet period collapses editor temp-file bursts before fingerprinting.
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                refresh_catalog(&state).await?;
                enqueue_changed_sources(&state,Some(&path)).await?;
            }
        }
    }

}).await
}

async fn enqueue_changed_sources(state: &AppState, changed: Option<&Path>) -> anyhow::Result<()> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.enqueue-changed-sources", async {

    let Ok(user_id) = current_user_id(state).await else {
        return Ok(());
    };
    let rows = {
        let store = state.inner.store.lock().await;
        let mut statement = store
            .prepare("select share_id,source_path from local_skill_sources where user_id=?1")?;
        statement
            .query_map([user_id.clone()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    PathBuf::from(row.get::<_, String>(1)?),
                ))
            })?
            .filter_map(Result::ok)
            .collect::<Vec<_>>()
    };
    for (share_id, path) in rows {
        if changed.is_none()
            || changed.is_some_and(|value| value.starts_with(&path) || path.starts_with(value))
        {
            files::enqueue_job(state, JOB_PUBLISH, &share_id, &user_id, 0)
                .await
                .map_err(|error| anyhow::anyhow!(error.message))?;
        }
    }
    Ok(())

}).await
}

fn target_roots() -> Vec<(String, PathBuf)> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    vec![
        ("codex".into(), home.join(".agents/skills")),
        ("codex".into(), home.join(".codex/skills")),
        ("claude".into(), home.join(".claude/skills")),
        ("myflicker".into(), home.join(".myflicker/skills")),
    ]
}

async fn refresh_catalog(state: &AppState) -> anyhow::Result<()> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.refresh-catalog", async {

    let mut discovered = BTreeMap::<PathBuf, Vec<String>>::new();
    for (target, root) in target_roots() {
        let Ok(children) = fs::read_dir(&root) else {
            continue;
        };
        for child in children.flatten() {
            let path = child.path();
            if path.join("SKILL.md").is_file() {
                discovered
                    // Keep the stable Agent installation path rather than resolving a managed
                    // version symlink. Otherwise every Agent Colab update would manufacture a
                    // new catalog source and an already-shared Skill would stop following it.
                    .entry(path)
                    .or_default()
                    .push(target.clone());
            }
        }
    }
    let discovered_paths = discovered
        .keys()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<HashSet<_>>();
    let store = state.inner.store.lock().await;
    let stale = {
        let mut statement = store.prepare(
            "select source_path from local_skill_catalog where discovered_targets!='[]'",
        )?;
        statement
            .query_map([], |row| row.get::<_, String>(0))?
            .filter_map(Result::ok)
            .filter(|path| !discovered_paths.contains(path))
            .collect::<Vec<_>>()
    };
    for path in stale {
        store.execute(
            "delete from local_skill_catalog where source_path=?1",
            [path],
        )?;
    }
    for (path, mut targets) in discovered {
        targets.sort();
        targets.dedup();
        // Discovery roots are user-managed and may contain unrelated or malformed packages.
        // One invalid SKILL.md must not make the entire catalog (and GUI) unavailable; explicit
        // sharing still reports that package's validation error to the caller.
        let Ok(metadata) = read_skill_metadata(&path) else {
            continue;
        };
        let Ok((last_changed_at, fingerprint)) = directory_fingerprint(&path) else {
            continue;
        };
        let source_id = stable_source_id(&path);
        store.execute("insert into local_skill_catalog(source_id,source_path,name,description,discovered_targets,last_changed_at,content_fingerprint) values(?1,?2,?3,?4,?5,?6,?7) on conflict(source_path) do update set name=excluded.name,description=excluded.description,discovered_targets=excluded.discovered_targets,last_changed_at=excluded.last_changed_at,content_fingerprint=excluded.content_fingerprint,updated_at=current_timestamp",rusqlite::params![source_id,path.to_string_lossy(),metadata.0,metadata.1,serde_json::to_string(&targets)?,last_changed_at,fingerprint])?;
    }
    Ok(())

}).await
}

pub(super) async fn list_skill_sources(
    State(state): State<AppState>,
    Query(query): Query<SourceQuery>,
) -> Result<Json<Vec<SkillSource>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.list-skill-sources", async {

    let needle = query.query.unwrap_or_default().to_lowercase();
    // The 48-hour window is a recommendation heuristic, not a search boundary. Once a user
    // searches explicitly, all discovered sources are eligible.
    let cutoff = if needle.is_empty() {
        unix_seconds() - query.recent_hours.unwrap_or(48).max(0) * 3600
    } else {
        0
    };
    let store = state.inner.store.lock().await;
    let mut statement=store.prepare("select source_id,source_path,name,description,discovered_targets,last_changed_at from local_skill_catalog where last_changed_at>=?1 order by last_changed_at desc,name").map_err(LocalError::internal)?;
    let shared_paths: HashSet<String> = if let Some(channel_id) = query.channel_id {
        let mut s = store
            .prepare("select source_path from local_skill_sources where channel_id=?1")
            .map_err(LocalError::internal)?;
        s.query_map([channel_id], |row| row.get(0))
            .map_err(LocalError::internal)?
            .filter_map(Result::ok)
            .collect()
    } else {
        HashSet::new()
    };
    let items = statement
        .query_map([cutoff], |row| {
            Ok(SkillSource {
                source_id: row.get(0)?,
                source_path: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                discovered_targets: serde_json::from_str(&row.get::<_, String>(4)?)
                    .unwrap_or_default(),
                last_changed_at: row.get(5)?,
            })
        })
        .map_err(LocalError::internal)?
        .filter_map(Result::ok)
        .filter(|item| {
            !shared_paths.contains(&item.source_path)
                && (needle.is_empty()
                    || item.name.to_lowercase().contains(&needle)
                    || item.source_path.to_lowercase().contains(&needle))
        })
        .collect();
    Ok(Json(items))

}).await
}

pub(super) async fn list_skill_shares(
    State(state): State<AppState>,
    AxumPath(channel_id): AxumPath<String>,
) -> Result<Json<Vec<SkillShare>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.list-skill-shares", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/channels/{channel_id}/skills",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let mut shares: Vec<SkillShare> = response.json().await.map_err(LocalError::internal)?;
    let user_id = current_user_id(&state).await?;
    let store = state.inner.store.lock().await;
    for share in &mut shares {
        store.execute("insert into skill_share_cache(share_id,name,description,contributor_name,contributor_avatar_url,remote_updated_at) values(?1,?2,?3,?4,?5,?6) on conflict(share_id) do update set name=excluded.name,description=excluded.description,contributor_name=excluded.contributor_name,contributor_avatar_url=excluded.contributor_avatar_url,remote_updated_at=excluded.remote_updated_at,updated_at=current_timestamp",rusqlite::params![share.id,share.name,share.description,share.contributor_name,share.contributor_avatar_url,share.updated_at]).map_err(LocalError::internal)?;
        share.local_path=store.query_row("select source_path from local_skill_sources where share_id=coalesce((select publication_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2",[&share.id,&user_id],|row|row.get(0)).or_else(|_|store.query_row("select local_path from skill_materializations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2",[&share.id,&user_id],|row|row.get(0))).ok();
    }
    Ok(Json(shares))

}).await
}

pub(super) async fn share_skill(
    State(state): State<AppState>,
    AxumPath(channel_id): AxumPath<String>,
    Json(body): Json<ShareSkill>,
) -> Result<(StatusCode, Json<SkillShare>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.share-skill", async {

    let source = if let Some(source_id) = body.source_id {
        let store = state.inner.store.lock().await;
        PathBuf::from(
            store
                .query_row(
                    "select source_path from local_skill_catalog where source_id=?1",
                    [source_id],
                    |row| row.get::<_, String>(0),
                )
                .map_err(|_| LocalError::bad_request("Skill source not found"))?,
        )
    } else {
        PathBuf::from(
            body.source_path
                .ok_or_else(|| LocalError::bad_request("Missing Skill source"))?,
        )
    };
    let source = if fs::symlink_metadata(&source)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
    {
        source
    } else {
        fs::canonicalize(source).map_err(LocalError::internal)?
    };
    if !source.join("SKILL.md").is_file() {
        return Err(LocalError::bad_request(
            "The selected directory is not a Skill root",
        ));
    }
    let metadata = read_skill_metadata(&source).map_err(LocalError::internal)?;
    let name = body
        .name
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| metadata.0.clone());
    let source = fs::canonicalize(source).map_err(LocalError::internal)?;
    let binding=assets::register(&state,&channel_id,"skill",&source,&name,metadata.1.as_deref(),"shadow-git-v1").await?;
    let mut share=list_skill_shares(State(state.clone()),AxumPath(channel_id.clone())).await?.0
        .into_iter().find(|share|share.id==binding.reference_id)
        .ok_or_else(||LocalError::bad_request("Registered Skill reference was not returned"))?;
    let shadow = state
        .inner
        .data_root
        .join("skill-shadows")
        .join(format!("{}.git", binding.publication_id));
    files::init_shadow(&shadow, &source)?;
    let user_id = current_user_id(&state).await?;
    let source_id = stable_source_id(&source);
    {
        let (last_changed, fingerprint) =
            directory_fingerprint(&source).map_err(LocalError::internal)?;
        let store = state.inner.store.lock().await;
        store.execute("insert into local_skill_catalog(source_id,source_path,name,description,discovered_targets,last_changed_at,content_fingerprint) values(?1,?2,?3,?4,'[]',?5,?6) on conflict(source_path) do update set name=excluded.name,description=excluded.description,last_changed_at=excluded.last_changed_at,content_fingerprint=excluded.content_fingerprint",rusqlite::params![source_id,source.to_string_lossy(),metadata.0,metadata.1,last_changed,fingerprint]).map_err(LocalError::internal)?;
        store.execute("insert into local_skill_sources(share_id,channel_id,user_id,source_id,source_path,shadow_git_path) values(?1,?2,?3,?4,?5,?6) on conflict(share_id) do nothing",rusqlite::params![binding.publication_id,channel_id,user_id,source_id,source.to_string_lossy(),shadow.to_string_lossy()]).map_err(LocalError::internal)?;
    }
    files::enqueue_job(&state, JOB_PUBLISH, &binding.publication_id, &user_id, 0).await?;
    files::wait_for_job(&state, JOB_PUBLISH, &binding.publication_id, &user_id).await?;
    share.local_path = Some(source.to_string_lossy().into_owned());
    Ok((StatusCode::CREATED, Json(share)))

}).await
}

pub(super) async fn publish_source(state: &AppState, share_id: &str) -> Result<(), LocalError> {
    let _publication_guard=assets::publication_guard(state,"skill",share_id).await;
    if !assets::enabled(state,share_id).await? { return Ok(()); }
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.publish-source", async {

    let user_id = current_user_id(state).await?;
    let (source, shadow, parent): (String, String, Option<String>) = {
        let store = state.inner.store.lock().await;
        store.query_row("select source_path,shadow_git_path,last_root_oid from local_skill_sources where share_id=?1 and user_id=?2",[share_id,&user_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).map_err(LocalError::internal)?
    };
    let source = PathBuf::from(source);
    let shadow = PathBuf::from(shadow);
    files::git(&shadow, &source, &["read-tree", "--empty"])?;
    files::git(&shadow, &source, &["add", "-A", "--", "."])?;
    let tree = files::git_text(&shadow, &source, &["write-tree"])?;
    if let Some(parent) = parent.as_deref() {
        if tree
            == files::git_text(
                &shadow,
                &source,
                &["rev-parse", &format!("{parent}^{{tree}}")],
            )?
        {
            return Ok(());
        }
    }
    let mut command = files::git_command(&shadow, &source);
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
        .write_all(b"Colab Skill snapshot\n")
        .map_err(LocalError::internal)?;
    let output = child.wait_with_output().map_err(LocalError::internal)?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    let root = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let mut pack = files::git_command(&shadow, &source);
    pack.args(["pack-objects", "--stdout", "--revs"]);
    if parent.is_some() {
        pack.arg("--thin");
    }
    pack.stdin(Stdio::piped()).stdout(Stdio::piped());
    let mut child = pack.spawn().map_err(LocalError::internal)?;
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
            "{}/v1/skills/{share_id}/revisions",
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
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let store = state.inner.store.lock().await;
    store.execute("update local_skill_sources set last_root_oid=?3,updated_at=current_timestamp where share_id=?1 and user_id=?2",[share_id,&user_id,&root]).map_err(LocalError::internal)?;
    Ok(())

}).await
}

pub(super) async fn preview_skill(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<Json<Value>, LocalError> {
    // Use the authenticated materializer; preview never installs or executes a Skill.
    let share = sync_materialization(&state, &share_id).await?;
    let root = share.local_path.ok_or_else(|| LocalError::internal("Skill materialization has no path"))?;
    let path = fs::canonicalize(Path::new(&root).join("SKILL.md")).map_err(LocalError::internal)?;
    let root = fs::canonicalize(root).map_err(LocalError::internal)?;
    if !path.starts_with(&root) { return Err(LocalError::bad_request("Invalid Skill entry path")); }
    if fs::metadata(&path).map_err(LocalError::internal)?.len() > 1024 * 1024 {
        return Err(LocalError::bad_request("SKILL.md is too large to preview"));
    }
    let content = fs::read_to_string(path).map_err(LocalError::internal)?;
    Ok(Json(json!({"content":content})))
}

pub(super) async fn materialize_skill(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<Json<SkillShare>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.materialize-skill", async {

    let user_id = current_user_id(&state).await?;
    files::enqueue_job(&state, JOB_MATERIALIZE, &share_id, &user_id, 0).await?;
    files::wait_for_job(&state, JOB_MATERIALIZE, &share_id, &user_id).await?;
    materialized_share(&state, &share_id, &user_id)
        .await
        .map(Json)

}).await
}

pub(super) async fn sync_materialization(
    state: &AppState,
    share_id: &str,
) -> Result<SkillShare, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.sync-materialization", async {

    // Direct consumers must resolve authorized metadata without requiring a preceding GUI list.
    // Cache presence is not authority: the revisions endpoint still checks current membership.
    let cached = {
        let store = state.inner.store.lock().await;
        store.query_row("select 1 from skill_share_cache where share_id=?1", [share_id], |_| Ok(())).is_ok()
    };
    if !cached {
        let channels = collaboration::list_channels(State(state.clone())).await?.0;
        let mut found = false;
        for channel in channels {
            let shares = list_skill_shares(State(state.clone()), AxumPath(channel.id)).await?.0;
            if shares.iter().any(|share| share.id == share_id) { found = true; break; }
        }
        if !found { return Err(LocalError { status: StatusCode::NOT_FOUND, message: "Skill is not available in the current Organization".into() }); }
    }
    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/skills/{share_id}/revisions",
            state.inner.server_url
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let revisions: Vec<Revision> = response.json().await.map_err(LocalError::internal)?;
    let user_id=current_user_id(state).await?;
    let asset_id=assets::binding(state,share_id).await?.asset_id;
    let _materialization_guard=assets::publication_guard(state,"materialize_skill",&format!("{user_id}:{asset_id}")).await;
    let latest = revisions
        .last()
        .ok_or_else(|| LocalError::bad_request("No Skill snapshot has been published"))?;
    let repo = state
        .inner
        .data_root
        .join("skill-materialized-repos")
        .join(&user_id)
        .join(format!("{asset_id}.git"));
    if !repo.exists() {
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
    }
    for revision in &revisions {
        if Command::new("git").arg(format!("--git-dir={}",repo.display())).args(["cat-file","-e",&format!("{}^{{commit}}",revision.root_oid)]).output().map_err(LocalError::internal)?.status.success(){continue;}
        let response = state
            .inner
            .http
            .get(format!(
                "{}/v1/skill-revisions/{}/content",
                state.inner.server_url, revision.id
            ))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        let bytes = response.bytes().await.map_err(LocalError::internal)?;
        let mut command = Command::new("git");
        command
            .arg(format!("--git-dir={}", repo.display()))
            .args(["index-pack", "--stdin", "--fix-thin"])
            .stdin(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn().map_err(LocalError::internal)?;
        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(&bytes)
            .map_err(LocalError::internal)?;
        let output = child.wait_with_output().map_err(LocalError::internal)?;
        if !output.status.success() {
            return Err(LocalError::internal(String::from_utf8_lossy(
                &output.stderr,
            )));
        }
    }
    let (name, contributor): (String, String) = {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select name,contributor_name from skill_share_cache where share_id=?1",
                [share_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((format!("skill-{}", &share_id[..8]), "Channel member".into()))
    };
    let target = state
        .inner
        .data_root
        .join("skills")
        .join(&user_id)
        .join(&asset_id)
        .join(files::safe_path_component(&contributor))
        .join(files::safe_path_component(&name));
    fs::create_dir_all(&target).map_err(LocalError::internal)?;
    files::git(
        &repo,
        &target,
        &["read-tree", "--reset", "-u", &latest.root_oid],
    )?;
    let user_id = current_user_id(state).await?;
    {
        let store = state.inner.store.lock().await;
        store.execute("insert into skill_materializations(share_id,user_id,local_path,last_root_oid) values(?1,?2,?3,?4) on conflict(share_id,user_id) do update set local_path=excluded.local_path,last_root_oid=excluded.last_root_oid,updated_at=current_timestamp",rusqlite::params![asset_id,user_id,target.to_string_lossy(),latest.root_oid]).map_err(LocalError::internal)?;
    }
    materialized_share(state, share_id, &user_id).await

}).await
}

async fn materialized_share(
    state: &AppState,
    share_id: &str,
    user_id: &str,
) -> Result<SkillShare, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.materialized-share", async {

    let store = state.inner.store.lock().await;
    let (local_path,root):(String,String)=store.query_row("select local_path,last_root_oid from skill_materializations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2",[share_id,user_id],|row|Ok((row.get(0)?,row.get(1)?))).map_err(LocalError::internal)?;
    let (name,description,contributor,avatar,updated):(String,Option<String>,String,Option<String>,String)=store.query_row("select name,description,contributor_name,contributor_avatar_url,remote_updated_at from skill_share_cache where share_id=?1",[share_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?))).map_err(LocalError::internal)?;
    Ok(SkillShare {
        id: share_id.into(),
        channel_id: String::new(),
        name,
        description,
        contributor_name: contributor,
        contributor_avatar_url: avatar,
        state: "active".into(),
        current_root_oid: Some(root),
        can_withdraw: false,
        updated_at: updated,
        local_path: Some(local_path),
    })

}).await
}

pub(super) async fn list_installations(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<Json<Vec<Installation>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.list-installations", async {

    let user_id = current_user_id(&state).await?;
    let current_root = current_skill_root(&state, &share_id).await?;
    let store = state.inner.store.lock().await;
    let mut result = Vec::new();
    for target in ["codex", "claude", "myflicker"] {
        let receipt:Option<(String,String,String)>=store.query_row("select installed_path,installed_root_oid,content_hash from skill_installations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2 and target_agent=?3",[&share_id,&user_id,target],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).ok();
        let item = match receipt {
            None => Installation {
                target_agent: target.into(),
                state: "not_installed".into(),
                installed_path: None,
                installed_root_oid: None,
                current_root_oid: current_root.clone(),
                activation: None,
            },
            Some((path, root, hash)) => {
                let actual = directory_hash(Path::new(&path)).ok();
                let state = if actual.as_deref() != Some(&hash) {
                    "conflict"
                } else if current_root.as_deref() != Some(&root) {
                    "update_available"
                } else {
                    "installed"
                };
                Installation {
                    target_agent: target.into(),
                    state: state.into(),
                    installed_path: Some(path),
                    installed_root_oid: Some(root),
                    current_root_oid: current_root.clone(),
                    activation: Some("new_session_required".into()),
                }
            }
        };
        result.push(item)
    }
    Ok(Json(result))

}).await
}

pub(super) async fn ensure_installed(
    State(state): State<AppState>,
    AxumPath((share_id, target)): AxumPath<(String, String)>,
) -> Result<Json<Installation>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.ensure-installed", async {

    let root = target_root(&target)?;
    let user_id = current_user_id(&state).await?;
    files::enqueue_job(&state, JOB_MATERIALIZE, &share_id, &user_id, 0).await?;
    files::wait_for_job(&state, JOB_MATERIALIZE, &share_id, &user_id).await?;
    let (source, current_root) = {
        let store = state.inner.store.lock().await;
        let (path,oid):(String,String)=store.query_row("select local_path,last_root_oid from skill_materializations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2",[&share_id,&user_id],|row|Ok((row.get(0)?,row.get(1)?))).map_err(LocalError::internal)?;
        (PathBuf::from(path), oid)
    };
    // A Shared Item's display name is user-facing and may differ from the package identity.
    // Agent installation must use the canonical SKILL.md name so native loaders find it.
    let name = read_skill_metadata(&source)
        .map_err(LocalError::internal)?
        .0;
    let destination = root.join(files::safe_path_component(&name));
    let prior = {
        let store = state.inner.store.lock().await;
        store.query_row("select content_hash from skill_installations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2 and target_agent=?3",[&share_id,&user_id,&target],|row|row.get::<_,String>(0)).ok()
    };
    if destination.exists() {
        match prior {
            Some(expected) if directory_hash(&destination).ok().as_deref() == Some(&expected) => {}
            _ => {
                return Err(LocalError::conflict(
                    "A non-Colab or locally modified Skill already uses this target path",
                ));
            }
        }
    }
    install_directory_atomically(&source, &destination)?;
    let hash = directory_hash(&destination).map_err(LocalError::internal)?;
    {
        let store = state.inner.store.lock().await;
        store.execute("insert into skill_installations(share_id,user_id,target_agent,installed_path,installed_root_oid,content_hash) values(coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1),?2,?3,?4,?5,?6) on conflict(share_id,user_id,target_agent) do update set installed_path=excluded.installed_path,installed_root_oid=excluded.installed_root_oid,content_hash=excluded.content_hash,installed_at=current_timestamp",rusqlite::params![share_id,user_id,target,destination.to_string_lossy(),current_root,hash]).map_err(LocalError::internal)?;
    }
    Ok(Json(Installation {
        target_agent: target,
        state: "installed".into(),
        installed_path: Some(destination.to_string_lossy().into_owned()),
        installed_root_oid: Some(current_root.clone()),
        current_root_oid: Some(current_root),
        activation: Some("new_session_required".into()),
    }))

}).await
}

pub(super) async fn uninstall(
    State(state): State<AppState>,
    AxumPath((share_id, target)): AxumPath<(String, String)>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.uninstall", async {

    let user_id = current_user_id(&state).await?;
    let (path, expected): (String, String) = {
        let store = state.inner.store.lock().await;
        store.query_row("select installed_path,content_hash from skill_installations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2 and target_agent=?3",[&share_id,&user_id,&target],|row|Ok((row.get(0)?,row.get(1)?))).map_err(|_|LocalError::bad_request("This Skill is not installed by Colab"))?
    };
    let path = PathBuf::from(path);
    if path.exists() && directory_hash(&path).map_err(LocalError::internal)? != expected {
        return Err(LocalError::conflict(
            "The installed Skill was modified locally; Colab will not remove it",
        ));
    }
    if path.exists() {
        fs::remove_dir_all(&path).map_err(LocalError::internal)?
    }
    {
        let store = state.inner.store.lock().await;
        store.execute("delete from skill_installations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2 and target_agent=?3",[&share_id,&user_id,&target]).map_err(LocalError::internal)?;
    }
    Ok(StatusCode::NO_CONTENT)

}).await
}

pub(super) async fn withdraw_skill(
    State(state): State<AppState>,
    AxumPath(share_id): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.withdraw-skill", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .delete(format!("{}/v1/skills/{share_id}", state.inner.server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    assets::after_withdraw(&state,&share_id,"skill").await?;
    Ok(StatusCode::NO_CONTENT)

}).await
}

async fn current_skill_root(
    state: &AppState,
    share_id: &str,
) -> Result<Option<String>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.skills.current-skill-root", async {

    let user_id = current_user_id(state).await?;
    let local = {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select last_root_oid from skill_materializations where share_id=coalesce((select asset_id from local_asset_references where reference_id=?1 and user_id=?2),?1) and user_id=?2",
                [share_id, &user_id],
                |row| row.get(0),
            )
            .ok()
    };
    if local.is_some() {
        return Ok(local);
    }
    let token = access_token(state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/skills/{share_id}/revisions",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let revisions: Vec<Revision> = response.json().await.map_err(LocalError::internal)?;
    Ok(revisions.last().map(|item| item.root_oid.clone()))

}).await
}

fn target_root(target: &str) -> Result<PathBuf, LocalError> {
    target_roots()
        .into_iter()
        .find(|(name, _)| name == target)
        .map(|(_, path)| path)
        .ok_or_else(|| LocalError::bad_request("Unsupported Agent target"))
}

fn read_skill_metadata(path: &Path) -> anyhow::Result<(String, Option<String>)> {
    let text = fs::read_to_string(path.join("SKILL.md"))?;
    let front = text
        .strip_prefix("---")
        .and_then(|rest| rest.split_once("---").map(|(front, _)| front));
    let parsed: SkillFrontmatter =
        front
            .map(serde_yaml::from_str)
            .transpose()?
            .unwrap_or(SkillFrontmatter {
                name: None,
                description: None,
            });
    let fallback = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("Shared Skill")
        .to_owned();
    Ok((
        parsed
            .name
            .filter(|v| !v.trim().is_empty())
            .unwrap_or(fallback),
        parsed.description.filter(|v| !v.trim().is_empty()),
    ))
}

fn stable_source_id(path: &Path) -> String {
    let mut hash = Sha256::new();
    hash.update(path.to_string_lossy().as_bytes());
    format!("src_{}", &format!("{:x}", hash.finalize())[..16])
}
fn unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn directory_fingerprint(root: &Path) -> anyhow::Result<(i64, String)> {
    let mut files = Vec::new();
    collect_files(root, root, &mut files)?;
    files.sort();
    let mut hash = Sha256::new();
    let mut latest = 0;
    for relative in files {
        let path = root.join(&relative);
        let metadata = fs::metadata(&path)?;
        let changed = metadata
            .modified()?
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        latest = latest.max(changed);
        hash.update(relative.to_string_lossy().as_bytes());
        hash.update(metadata.len().to_le_bytes());
        hash.update(changed.to_le_bytes());
    }
    Ok((latest, format!("{:x}", hash.finalize())))
}
fn directory_hash(root: &Path) -> anyhow::Result<String> {
    let mut files = Vec::new();
    collect_files(root, root, &mut files)?;
    files.sort();
    let mut hash = Sha256::new();
    for relative in files {
        hash.update(relative.to_string_lossy().as_bytes());
        hash.update(fs::read(root.join(relative))?);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn collect_files(root: &Path, current: &Path, result: &mut Vec<PathBuf>) -> anyhow::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let relative = path.strip_prefix(root)?.to_path_buf();
        if relative
            .components()
            .next()
            .is_some_and(|part| part.as_os_str() == ".git")
        {
            continue;
        }
        // Do not follow links out of a user-managed Skill root. Install and publication should
        // describe the package itself, not an arbitrary linked directory tree.
        let metadata = entry.file_type()?;
        if metadata.is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            collect_files(root, &path, result)?
        } else if metadata.is_file() {
            result.push(relative)
        }
    }
    Ok(())
}

fn install_directory_atomically(source: &Path, destination: &Path) -> Result<(), LocalError> {
    fs::create_dir_all(destination.parent().unwrap()).map_err(LocalError::internal)?;
    let stage = destination.with_extension(format!("colab-stage-{}", Uuid::new_v4()));
    copy_directory(source, &stage)?;
    let backup = destination.with_extension(format!("colab-backup-{}", Uuid::new_v4()));
    if destination.exists() {
        fs::rename(destination, &backup).map_err(LocalError::internal)?
    }
    if let Err(error) = fs::rename(&stage, destination) {
        if backup.exists() {
            let _ = fs::rename(&backup, destination);
        }
        return Err(LocalError::internal(error));
    }
    if backup.exists() {
        fs::remove_dir_all(backup).map_err(LocalError::internal)?
    }
    Ok(())
}
fn copy_directory(source: &Path, destination: &Path) -> Result<(), LocalError> {
    fs::create_dir_all(destination).map_err(LocalError::internal)?;
    for entry in fs::read_dir(source).map_err(LocalError::internal)? {
        let entry = entry.map_err(LocalError::internal)?;
        if entry.file_name() == ".git" {
            continue;
        }
        let from = entry.path();
        let to = destination.join(entry.file_name());
        let metadata = entry.metadata().map_err(LocalError::internal)?;
        if metadata.is_dir() {
            copy_directory(&from, &to)?
        } else if metadata.is_file() {
            fs::copy(from, to).map_err(LocalError::internal)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_frontmatter_and_hashes_content() {
        let root = std::env::temp_dir().join(format!("colab-skill-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("SKILL.md"),
            "---\nname: Demo Skill\ndescription: Useful\n---\nBody\n",
        )
        .unwrap();
        let metadata = read_skill_metadata(&root).unwrap();
        assert_eq!(metadata.0, "Demo Skill");
        let first = directory_hash(&root).unwrap();
        fs::write(root.join("note.txt"), "changed").unwrap();
        assert_ne!(first, directory_hash(&root).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
