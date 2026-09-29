use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use axum::{Json, extract::State, http::StatusCode};
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
    if request.items.is_empty() || request.items.len() > 20 {
        return Err(LocalError::bad_request("Choose between 1 and 20 items"));
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
        store.execute("insert into local_quick_transfers(transfer_id,read_token,revoke_token,expires_at) values(?1,?2,?3,?4)",[&created.id,&created.read_token,&created.revoke_token,&created.expires_at]).map_err(LocalError::internal)?;
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
    let (transfer_id, token) = parse_capability(&request.capability)?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/transfers/{transfer_id}",
            state.inner.server_url
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(LocalError::internal)?;
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
}

async fn receive_item(
    state: &AppState,
    transfer_id: &str,
    expires_at: &str,
    token: &str,
    root: &Path,
    item: ManifestItem,
) -> Result<ReceivedItem, LocalError> {
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
            "delete from local_quick_transfers where transfer_id=?1",
            [request.transfer_id],
        )
        .map_err(LocalError::internal)?;
    Ok(StatusCode::NO_CONTENT)
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
