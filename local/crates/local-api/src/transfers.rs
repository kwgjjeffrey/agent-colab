use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use axum::{
    Json,
    extract::{Path as AxumPath, State},
    http::StatusCode,
};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::io::{ReaderStream, StreamReader};
use uuid::Uuid;

use crate::{AppState, LocalError, files, remote_error};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateTransferRequest {
    expires_in_seconds: Option<i64>,
    items: Vec<TransferSource>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferSource {
    kind: String,
    name: Option<String>,
    source_path: String,
    source_adapter: Option<String>,
    #[serde(default)]
    sync_excludes: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerCreatedTransfer {
    id: String,
    upload_token: String,
    read_token: String,
    revoke_token: String,
    expires_at: String,
}

#[derive(Deserialize)]
struct ServerItem {
    id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreatedTransfer {
    transfer_id: String,
    capability: String,
    expires_at: String,
}

pub(super) async fn create_transfer(
    State(state): State<AppState>,
    Json(request): Json<CreateTransferRequest>,
) -> Result<(StatusCode, Json<CreatedTransfer>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.create-transfer", async {

    if request.items.len() != 1 {
        return Err(LocalError::bad_request(
            "Quick Share accepts exactly one item",
        ));
    }
    let response = state
        .inner
        .http
        .post(format!("{}/v1/transfers", state.inner.server_url))
        .json(&json!({"expiresInSeconds":request.expires_in_seconds.unwrap_or(24*60*60)}))
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let created: ServerCreatedTransfer = response.json().await.map_err(LocalError::internal)?;
    let staging = state
        .inner
        .data_root
        .join("transfer-staging")
        .join(&created.id);
    fs::create_dir_all(&staging).map_err(LocalError::internal)?;

    for (position, source) in request.items.iter().enumerate() {
        let prepared = prepare_source(&staging, position, source).await?;
        let response=state.inner.http.post(format!("{}/v1/transfers/{}/items",state.inner.server_url,created.id))
            .bearer_auth(&created.upload_token)
            .json(&json!({"kind":source.kind,"name":prepared.name,"sourceAdapter":prepared.adapter,"metadata":prepared.metadata}))
            .send().await.map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
        let item: ServerItem = response.json().await.map_err(LocalError::internal)?;
        let file = tokio::fs::File::open(&prepared.payload)
            .await
            .map_err(LocalError::internal)?;
        let response = state
            .inner
            .http
            .put(format!(
                "{}/v1/transfers/{}/items/{}/content",
                state.inner.server_url, created.id, item.id
            ))
            .bearer_auth(&created.upload_token)
            .body(reqwest::Body::wrap_stream(ReaderStream::new(file)))
            .send()
            .await
            .map_err(LocalError::internal)?;
        if !response.status().is_success() {
            return Err(remote_error(response).await);
        }
    }
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/transfers/{}/finalize",
            state.inner.server_url, created.id
        ))
        .bearer_auth(&created.upload_token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    {
        // Creator capabilities are intentionally kept only in the user-private Local Core SQLite
        // store. They never enter a resource name, URL path, log line, or server-side plaintext.
        let store = state.inner.store.lock().await;
        let source = &request.items[0];
        let name = source.name.as_deref().unwrap_or_else(|| {
            Path::new(&source.source_path)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Shared context")
        });
        store.execute("insert into local_quick_transfers(transfer_id,read_token,revoke_token,expires_at,item_kind,item_name) values(?1,?2,?3,?4,?5,?6)",rusqlite::params![created.id,created.read_token,created.revoke_token,created.expires_at,source.kind,name]).map_err(LocalError::internal)?;
    }
    let _ = fs::remove_dir_all(&staging);
    Ok((
        StatusCode::CREATED,
        Json(CreatedTransfer {
            transfer_id: created.id.clone(),
            capability: format!(
                "agent-colab-transfer://{}/{}",
                created.id, created.read_token
            ),
            expires_at: created.expires_at,
        }),
    ))

}).await
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TransferAccess {
    display_name: Option<String>,
    avatar_url: Option<String>,
    first_accessed_at: String,
    last_accessed_at: String,
    access_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedServerItem {
    kind: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedServerTransfer {
    id: String,
    state: String,
    expires_at: String,
    created_at: String,
    item: ManagedServerItem,
    accesses: Vec<TransferAccess>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ManagedTransfer {
    transfer_id: String,
    capability: String,
    state: String,
    expires_at: String,
    created_at: String,
    item_kind: String,
    item_name: String,
    accesses: Vec<TransferAccess>,
}

async fn fetch_managed(
    state: &AppState,
    transfer_id: &str,
    read_token: &str,
    revoke_token: &str,
) -> Result<ManagedTransfer, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.fetch-managed", async {

    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/transfers/{transfer_id}/manage",
            state.inner.server_url
        ))
        .bearer_auth(revoke_token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let remote: ManagedServerTransfer = response.json().await.map_err(LocalError::internal)?;
    Ok(ManagedTransfer {
        transfer_id: remote.id,
        capability: format!("agent-colab-transfer://{transfer_id}/{read_token}"),
        state: remote.state,
        expires_at: remote.expires_at,
        created_at: remote.created_at,
        item_kind: remote.item.kind,
        item_name: remote.item.name,
        accesses: remote.accesses,
    })

}).await
}

pub(super) async fn list_transfers(
    State(state): State<AppState>,
) -> Result<Json<Vec<ManagedTransfer>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.list-transfers", async {

    let rows = {
        let store = state.inner.store.lock().await;
        let mut statement=store.prepare("select transfer_id,read_token,revoke_token,expires_at,item_kind,item_name,case when revoked_at is not null then 'revoked' when datetime(expires_at)<=datetime('now') then 'expired' else 'ready' end local_state,created_at from local_quick_transfers order by created_at desc").map_err(LocalError::internal)?;
        statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })
            .map_err(LocalError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(LocalError::internal)?
    };
    let mut result = Vec::with_capacity(rows.len());
    for (id, read, revoke, expires, kind, name, local_state, created) in rows {
        if local_state != "ready" {
            result.push(ManagedTransfer {
                transfer_id: id.clone(),
                capability: format!("agent-colab-transfer://{id}/{read}"),
                state: local_state,
                expires_at: expires,
                created_at: created,
                item_kind: kind,
                item_name: name,
                accesses: Vec::new(),
            });
        } else if let Ok(remote) = fetch_managed(&state, &id, &read, &revoke).await {
            result.push(remote);
        }
    }
    Ok(Json(result))

}).await
}

pub(super) async fn get_transfer(
    State(state): State<AppState>,
    AxumPath(transfer_id): AxumPath<String>,
) -> Result<Json<ManagedTransfer>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.get-transfer", async {

    let (read, revoke) = {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select read_token,revoke_token from local_quick_transfers where transfer_id=?1",
                [&transfer_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map_err(|_| LocalError::bad_request("Quick Share receipt was not found"))?
    };
    fetch_managed(&state, &transfer_id, &read, &revoke)
        .await
        .map(Json)

}).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateTransferRequest {
    expires_in_seconds: i64,
}

pub(super) async fn update_transfer(
    State(state): State<AppState>,
    AxumPath(transfer_id): AxumPath<String>,
    Json(request): Json<UpdateTransferRequest>,
) -> Result<Json<ManagedTransfer>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.update-transfer", async {

    if !(5 * 60..=7 * 24 * 60 * 60).contains(&request.expires_in_seconds) {
        return Err(LocalError::bad_request(
            "Expiry must be between 5 minutes and 7 days",
        ));
    }
    let (read, revoke) = {
        let store = state.inner.store.lock().await;
        store.query_row("select read_token,revoke_token from local_quick_transfers where transfer_id=?1 and revoked_at is null",[&transfer_id],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?))).map_err(|_|LocalError::bad_request("Active Quick Share receipt was not found"))?
    };
    let response = state
        .inner
        .http
        .patch(format!(
            "{}/v1/transfers/{transfer_id}/manage",
            state.inner.server_url
        ))
        .bearer_auth(&revoke)
        .json(&json!({"expiresInSeconds":request.expires_in_seconds}))
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let expires_at = response
        .json::<Value>()
        .await
        .map_err(LocalError::internal)?
        .get("expiresAt")
        .and_then(Value::as_str)
        .ok_or_else(|| LocalError::internal("Server omitted expiry"))?
        .to_owned();
    {
        let store = state.inner.store.lock().await;
        store
            .execute(
                "update local_quick_transfers set expires_at=?2 where transfer_id=?1",
                [&transfer_id, &expires_at],
            )
            .map_err(LocalError::internal)?;
    }
    fetch_managed(&state, &transfer_id, &read, &revoke)
        .await
        .map(Json)

}).await
}

struct PreparedSource {
    name: String,
    adapter: String,
    metadata: Value,
    payload: PathBuf,
}

async fn prepare_source(
    staging: &Path,
    position: usize,
    source: &TransferSource,
) -> Result<PreparedSource, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.prepare-source", async {

    let path = fs::canonicalize(&source.source_path).map_err(LocalError::internal)?;
    let name = source
        .name
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
        .or_else(|| path.file_name().map(|v| v.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "Shared context".into());
    match source.kind.as_str() {
        "files" | "skill" => {
            if source.kind == "skill" && !path.join("SKILL.md").is_file() {
                return Err(LocalError::bad_request(
                    "A Skill source must contain SKILL.md",
                ));
            }
            let shadow = staging.join(format!("{position}.git"));
            let payload = staging.join(format!("{position}.pack"));
            let excludes = if source.kind == "skill" {
                Vec::new()
            } else {
                source.sync_excludes.clone()
            };
            let root = files::create_full_snapshot_pack(
                &path,
                &shadow,
                &payload,
                &excludes,
                "Colab Quick Share snapshot\n",
            )?;
            Ok(PreparedSource {
                name,
                adapter: "shadow-git-v1".into(),
                metadata: json!({"rootOid":root}),
                payload,
            })
        }
        "session" => {
            if !path.is_file() {
                return Err(LocalError::bad_request("A Session source must be a file"));
            }
            let adapter = source
                .source_adapter
                .clone()
                .ok_or_else(|| LocalError::bad_request("A Session source adapter is required"))?;
            if !matches!(
                adapter.as_str(),
                "codex-jsonl-v1"
                    | "myflicker-jsonl-v1"
                    | "myflicker-desktop-jsonl-v1"
                    | "claude-jsonl-v1"
            ) {
                return Err(LocalError::bad_request("Unsupported Session adapter"));
            }
            let payload = staging.join(format!("{position}.jsonl"));
            // Copying before upload freezes the byte boundary even if the provider app appends to
            // its transcript while this transfer is being created.
            let mut input = tokio::fs::File::open(&path)
                .await
                .map_err(LocalError::internal)?;
            let mut output = tokio::fs::File::create(&payload)
                .await
                .map_err(LocalError::internal)?;
            tokio::io::copy(&mut input, &mut output)
                .await
                .map_err(LocalError::internal)?;
            output.sync_all().await.map_err(LocalError::internal)?;
            Ok(PreparedSource {
                name,
                adapter,
                metadata: json!({}),
                payload,
            })
        }
        _ => Err(LocalError::bad_request("Unsupported transfer item kind")),
    }

}).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReceiveTransferRequest {
    capability: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferManifest {
    id: String,
    expires_at: String,
    items: Vec<ManifestItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestItem {
    id: String,
    kind: String,
    name: String,
    source_adapter: String,
    metadata: Value,
    digest: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReceivedTransfer {
    transfer_id: String,
    expires_at: String,
    items: Vec<ReceivedItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReceivedItem {
    id: String,
    kind: String,
    name: String,
    source_adapter: String,
    local_path: String,
    tree: Option<Vec<TreeEntry>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeEntry {
    path: String,
    kind: String,
}

pub(super) async fn receive_transfer(
    State(state): State<AppState>,
    Json(request): Json<ReceiveTransferRequest>,
) -> Result<Json<ReceivedTransfer>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.receive-transfer", async {

    let (transfer_id, token) = parse_capability(&request.capability)?;
    let reader_id = {
        let store = state.inner.store.lock().await;
        if let Ok(value) = store.query_row(
            "select value from local_settings where key='quick_share_reader_id'",
            [],
            |row| row.get::<_, String>(0),
        ) {
            value
        } else {
            let value = Uuid::new_v4().to_string();
            store
                .execute(
                    "insert into local_settings(key,value) values('quick_share_reader_id',?1)",
                    [&value],
                )
                .map_err(LocalError::internal)?;
            value
        }
    };
    let mut request_builder = state
        .inner
        .http
        .get(format!(
            "{}/v1/transfers/{transfer_id}",
            state.inner.server_url
        ))
        .bearer_auth(&token)
        .header("x-colab-reader-id", reader_id);
    // A signed-in recipient can be shown by name to the creator. Anonymous Quick Share remains
    // valid: absence of this independently authenticated session only produces an anonymous use.
    if state.inner.session.lock().await.is_some()
        && let Ok(session_token) = crate::access_token(&state).await
    {
        request_builder = request_builder.header("x-colab-session", session_token);
    }
    let response = request_builder.send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let manifest: TransferManifest = response.json().await.map_err(LocalError::internal)?;
    let root = state.inner.data_root.join("transfers").join(&manifest.id);
    fs::create_dir_all(&root).map_err(LocalError::internal)?;
    let mut received = Vec::with_capacity(manifest.items.len());
    for item in manifest.items {
        received.push(
            receive_item(
                &state,
                &manifest.id,
                &manifest.expires_at,
                &token,
                &root,
                item,
            )
            .await?,
        );
    }
    Ok(Json(ReceivedTransfer {
        transfer_id: manifest.id,
        expires_at: manifest.expires_at,
        items: received,
    }))

}).await
}

async fn receive_item(
    state: &AppState,
    transfer_id: &str,
    expires_at: &str,
    token: &str,
    root: &Path,
    item: ManifestItem,
) -> Result<ReceivedItem, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.receive-item", async {

    let item_root = root.join(files::safe_path_component(&item.name));
    fs::create_dir_all(&item_root).map_err(LocalError::internal)?;
    let payload = item_root.join(".colab-payload");
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/transfers/{transfer_id}/items/{}/content",
            state.inner.server_url, item.id
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let stream = response.bytes_stream().map_err(std::io::Error::other);
    let mut input = StreamReader::new(stream);
    let temporary = payload.with_extension("downloading");
    let mut output = tokio::fs::File::create(&temporary)
        .await
        .map_err(LocalError::internal)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 128 * 1024];
    loop {
        let count = input
            .read(&mut buffer)
            .await
            .map_err(LocalError::internal)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        output
            .write_all(&buffer[..count])
            .await
            .map_err(LocalError::internal)?;
    }
    output.sync_all().await.map_err(LocalError::internal)?;
    drop(output);
    let digest = hex::encode(hasher.finalize());
    if item.digest.as_deref() != Some(&digest) {
        return Err(LocalError::conflict("Transfer item digest mismatch"));
    }
    tokio::fs::rename(&temporary, &payload)
        .await
        .map_err(LocalError::internal)?;
    let local_path = match item.kind.as_str() {
        "files" | "skill" => materialize_git_item(
            &item_root,
            &payload,
            item.metadata
                .get("rootOid")
                .and_then(Value::as_str)
                .ok_or_else(|| LocalError::bad_request("Transfer omitted Git root"))?,
        )?,
        "session" => {
            let target = item_root.join("session.jsonl");
            fs::rename(&payload, &target).map_err(LocalError::internal)?;
            target
        }
        _ => return Err(LocalError::bad_request("Unsupported transfer item kind")),
    };
    {
        let store = state.inner.store.lock().await;
        store.execute("insert into received_transfer_items(transfer_id,item_id,kind,name,source_adapter,local_path,digest,expires_at) values(?1,?2,?3,?4,?5,?6,?7,?8) on conflict(transfer_id,item_id) do update set local_path=excluded.local_path,digest=excluded.digest,expires_at=excluded.expires_at,received_at=current_timestamp",rusqlite::params![transfer_id,item.id,item.kind,item.name,item.source_adapter,local_path.to_string_lossy(),digest,expires_at]).map_err(LocalError::internal)?;
    }
    let tree = (item.kind == "files")
        .then(|| collect_tree(&local_path))
        .transpose()?;
    Ok(ReceivedItem {
        id: item.id,
        kind: item.kind,
        name: item.name,
        source_adapter: item.source_adapter,
        local_path: local_path.to_string_lossy().into_owned(),
        tree,
    })

}).await
}

fn materialize_git_item(root: &Path, pack: &Path, root_oid: &str) -> Result<PathBuf, LocalError> {
    if root_oid.len() != 40 && root_oid.len() != 64 {
        return Err(LocalError::bad_request("Invalid transfer Git root"));
    }
    let repo = root.join("repo.git");
    let target = root.join("content");
    if !repo.exists() {
        let status = Command::new("git")
            .args(["init", "--bare", "--quiet", repo.to_string_lossy().as_ref()])
            .status()
            .map_err(LocalError::internal)?;
        if !status.success() {
            return Err(LocalError::internal("initialize transfer Git repository"));
        }
    }
    let input = fs::File::open(pack).map_err(LocalError::internal)?;
    let output = Command::new("git")
        .arg(format!("--git-dir={}", repo.display()))
        .args(["index-pack", "--stdin", "--fix-thin"])
        .stdin(Stdio::from(input))
        .output()
        .map_err(LocalError::internal)?;
    if !output.status.success() {
        return Err(LocalError::internal(String::from_utf8_lossy(
            &output.stderr,
        )));
    }
    fs::create_dir_all(&target).map_err(LocalError::internal)?;
    files::git(&repo, &target, &["read-tree", "--reset", "-u", root_oid])?;
    Ok(target)
}

fn collect_tree(root: &Path) -> Result<Vec<TreeEntry>, LocalError> {
    fn walk(root: &Path, current: &Path, entries: &mut Vec<TreeEntry>) -> std::io::Result<()> {
        if entries.len() >= 10_000 {
            return Ok(());
        }
        let mut children = fs::read_dir(current)?.collect::<Result<Vec<_>, _>>()?;
        children.sort_by_key(|e| e.file_name());
        for child in children {
            let path = child.path();
            let relative = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let is_dir = path.is_dir();
            entries.push(TreeEntry {
                path: relative,
                kind: if is_dir { "directory" } else { "file" }.into(),
            });
            if is_dir {
                walk(root, &path, entries)?;
            }
        }
        Ok(())
    }
    let mut entries = Vec::new();
    walk(root, root, &mut entries).map_err(LocalError::internal)?;
    Ok(entries)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RevokeTransferRequest {
    transfer_id: String,
    revoke_token: Option<String>,
}

pub(super) async fn revoke_transfer(
    State(state): State<AppState>,
    Json(request): Json<RevokeTransferRequest>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.transfers.revoke-transfer", async {

    let token = if let Some(token) = request.revoke_token {
        token
    } else {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select revoke_token from local_quick_transfers where transfer_id=?1",
                [&request.transfer_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| LocalError::bad_request("Transfer revoke capability is unavailable"))?
    };
    let response = state
        .inner
        .http
        .delete(format!(
            "{}/v1/transfers/{}",
            state.inner.server_url, request.transfer_id
        ))
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
            "update local_quick_transfers set revoked_at=current_timestamp where transfer_id=?1",
            [request.transfer_id],
        )
        .map_err(LocalError::internal)?;
    Ok(StatusCode::NO_CONTENT)

}).await
}

fn parse_capability(value: &str) -> Result<(String, String), LocalError> {
    let rest = value
        .strip_prefix("agent-colab-transfer://")
        .ok_or_else(|| LocalError::bad_request("Invalid transfer capability"))?;
    let (id, token) = rest
        .split_once('/')
        .ok_or_else(|| LocalError::bad_request("Invalid transfer capability"))?;
    Uuid::parse_str(id).map_err(|_| LocalError::bad_request("Invalid transfer id"))?;
    if token.len() != 64 || !token.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(LocalError::bad_request("Invalid transfer token"));
    }
    Ok((id.into(), token.into()))
}

#[cfg(test)]
mod tests {
    use super::parse_capability;
    #[test]
    fn capability_requires_canonical_scheme_uuid_and_secret() {
        let value = "agent-colab-transfer://550e8400-e29b-41d4-a716-446655440000/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert!(parse_capability(value).is_ok());
        assert!(parse_capability("https://example.invalid/token").is_err());
    }
}
