//! Explicit artifact publication never registers a watched Skill directory.
use super::*;
use axum::{body::Body, http::HeaderValue};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Publish {
    artifact_path: String,
    version: String,
    reference_id: Option<String>,
    package_key: String,
    name: Option<String>,
    source_commit: Option<String>,
    #[serde(default)]
    release_notes: String,
}
pub(super) async fn publish(
    State(s): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    Json(b): Json<Publish>,
) -> Result<Json<Value>, LocalError> {
    current_user_id(&s).await?;
    if fs::metadata(&b.artifact_path)
        .map_err(LocalError::internal)?
        .len()
        > 25 * 1024 * 1024
    {
        return Err(LocalError::bad_request("Skill ZIP must be at most 25 MiB"));
    }
    let archive = fs::read(&b.artifact_path).map_err(LocalError::internal)?;
    if archive.is_empty() || archive.len() > 25 * 1024 * 1024 {
        return Err(LocalError::bad_request("Skill ZIP must be at most 25 MiB"));
    }
    let digest = hex::encode(Sha256::digest(&archive));
    let staging = s
        .inner
        .data_root
        .join("skill-release-staging")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&staging).map_err(LocalError::internal)?;
    let result = publish_inner(&s, &channel, &b, &archive, &digest, &staging).await;
    let _ = fs::remove_dir_all(&staging);
    result.map(Json)
}
async fn publish_inner(
    s: &AppState,
    channel: &str,
    b: &Publish,
    archive: &[u8],
    digest: &str,
    staging: &Path,
) -> Result<Value, LocalError> {
    let content = staging.join("content");
    fs::create_dir_all(&content).map_err(LocalError::internal)?;
    let source = extract_archive(archive, &content).map_err(LocalError::internal)?;
    let (name, description) = skills::read_skill_metadata(&source).map_err(LocalError::internal)?;
    let token = access_token(s).await?;
    let reference = if let Some(id) = &b.reference_id {
        let shares = skills::list_skill_shares(State(s.clone()), AxumPath(channel.into()))
            .await?
            .0;
        if !shares.iter().any(|v| v.id == *id) {
            return Err(LocalError::bad_request(
                "Skill reference is not in the selected Channel",
            ));
        };
        id.clone()
    } else {
        let r=s.inner.http.post(format!("{}/v1/channels/{channel}/skill-packages",s.inner.server_url)).bearer_auth(&token).json(&json!({"name":b.name.as_deref().unwrap_or(&name),"description":description,"packageKey":b.package_key})).send().await.map_err(LocalError::internal)?;
        if !r.status().is_success() {
            return Err(remote_error(r).await);
        };
        let binding: assets::Binding = r.json().await.map_err(LocalError::internal)?;
        binding.reference_id
    };
    let _guard = assets::publication_guard(s, "skill-release", &reference).await;
    let binding = assets::binding(s, &reference).await?;
    let repo = staging.join("projection.git");
    files::init_shadow(&repo, &source)?;
    files::git(&repo, &source, &["add", "-A", "--", "."])?;
    let tree = files::git_text(&repo, &source, &["write-tree"])?;
    let output = files::git_command(&repo, &source)
        .args([
            "commit-tree",
            &tree,
            "-m",
            &format!("Skill release {}", b.version),
        ])
        .env("GIT_AUTHOR_NAME", "Colab")
        .env("GIT_AUTHOR_EMAIL", "release@agent-colab")
        .env("GIT_COMMITTER_NAME", "Colab")
        .env("GIT_COMMITTER_EMAIL", "release@agent-colab")
        .env("GIT_AUTHOR_DATE", "2000-01-01T00:00:00Z")
        .env("GIT_COMMITTER_DATE", "2000-01-01T00:00:00Z")
        .output()
        .map_err(LocalError::internal)?;
    if !output.status.success() {
        return Err(LocalError::internal("Skill release projection failed"));
    };
    let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let mut command = files::git_command(&repo, &source);
    command
        .args(["pack-objects", "--stdout", "--revs"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped());
    let mut child = command.spawn().map_err(LocalError::internal)?;
    writeln!(child.stdin.as_mut().unwrap(), "{root}").map_err(LocalError::internal)?;
    let pack = child.wait_with_output().map_err(LocalError::internal)?;
    if !pack.status.success() {
        return Err(LocalError::internal("Skill pack failed"));
    }
    let r=s.inner.http.post(format!("{}/v1/skills/{reference}/releases",s.inner.server_url)).bearer_auth(token).json(&json!({"version":b.version,"artifactSha256":digest,"artifact":STANDARD.encode(archive),"pack":STANDARD.encode(pack.stdout),"rootOid":root,"parentRootOid":binding.current_root_oid,"sourceCommit":b.source_commit,"releaseNotes":b.release_notes})).send().await.map_err(LocalError::internal)?;
    if !r.status().is_success() {
        return Err(remote_error(r).await);
    }
    let release: Value = r.json().await.map_err(LocalError::internal)?;
    Ok(
        json!({"referenceId":reference,"assetId":binding.asset_id,"channelId":channel,"version":release["version"],"releaseId":release["id"],"artifactSha256":release["artifactSha256"],"rootOid":release["rootOid"],"stableRef":format!("colab://channel/{channel}/{reference}")}),
    )
}
fn extract_archive(bytes: &[u8], target: &Path) -> anyhow::Result<PathBuf> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))?;
    if archive.len() > 5000 {
        anyhow::bail!("Too many Skill files")
    };
    let mut total = 0u64;
    let mut paths = std::collections::HashSet::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        if file.name().contains('\\') || file.name().contains(':') {
            anyhow::bail!("Non-portable Skill ZIP path");
        }
        let relative = file
            .enclosed_name()
            .ok_or_else(|| anyhow::anyhow!("Unsafe ZIP path"))?
            .to_path_buf();
        if relative.components().any(|c| c.as_os_str() == ".git")
            || file.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
            || !paths.insert(relative.clone())
        {
            anyhow::bail!("Unsafe or duplicate Skill ZIP entry")
        }
        total = total
            .checked_add(file.size())
            .ok_or_else(|| anyhow::anyhow!("ZIP size overflow"))?;
        if total > 100 * 1024 * 1024 {
            anyhow::bail!("Unpacked Skill exceeds 100 MiB")
        }
        let path = target.join(relative);
        if file.is_dir() {
            fs::create_dir_all(path)?;
            continue;
        }
        fs::create_dir_all(path.parent().unwrap())?;
        let mut output = fs::File::create(&path)?;
        let copied = std::io::copy(
            &mut Read::by_ref(&mut file).take(100 * 1024 * 1024 + 1),
            &mut output,
        )?;
        if copied != file.size() {
            anyhow::bail!("ZIP entry size mismatch")
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o777))?;
            }
        }
    }
    if target.join("SKILL.md").is_file() {
        return Ok(target.into());
    }
    let entries = fs::read_dir(target)?.collect::<Result<Vec<_>, _>>()?;
    if entries.len() == 1 && entries[0].path().join("SKILL.md").is_file() {
        return Ok(entries[0].path());
    }
    anyhow::bail!("ZIP must contain one Skill root with SKILL.md")
}
pub(super) async fn list(
    State(s): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<Value>, LocalError> {
    proxy(&s, "GET", &format!("/v1/skills/{id}/releases"), None)
        .await
        .map(Json)
}
pub(super) async fn promote(
    State(s): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(b): Json<Value>,
) -> Result<Json<Value>, LocalError> {
    proxy(
        &s,
        "POST",
        &format!("/v1/skills/{id}/releases/promote"),
        Some(b),
    )
    .await
    .map(Json)
}
pub(super) async fn publisher(
    State(s): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(b): Json<Value>,
) -> Result<Json<Value>, LocalError> {
    proxy(&s, "PUT", &format!("/v1/skills/{id}/publishers"), Some(b))
        .await
        .map(Json)
}
async fn proxy(
    s: &AppState,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, LocalError> {
    let mut r = s
        .inner
        .http
        .request(
            method.parse().unwrap(),
            format!("{}{path}", s.inner.server_url),
        )
        .bearer_auth(access_token(s).await?);
    if let Some(b) = body {
        r = r.json(&b)
    }
    let r = r.send().await.map_err(LocalError::internal)?;
    if !r.status().is_success() {
        return Err(remote_error(r).await);
    }
    r.json().await.map_err(LocalError::internal)
}

pub(super) async fn download(
    State(s): State<AppState>,
    AxumPath((id, version)): AxumPath<(String, String)>,
) -> Result<Response, LocalError> {
    let r = s
        .inner
        .http
        .get(format!(
            "{}/v1/skills/{id}/releases/{version}/artifact",
            s.inner.server_url
        ))
        .bearer_auth(access_token(&s).await?)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !r.status().is_success() {
        return Err(remote_error(r).await);
    }
    let mut result = Response::new(Body::from_stream(r.bytes_stream()));
    result.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::HeaderValue};
    fn zip(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, content) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }
    #[test]
    fn accepts_canonical_wrapped_skill_and_preserves_nested_files() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&dir).unwrap();
        let root = extract_archive(
            &zip(&[
                ("agent-colab/SKILL.md", "---\nname: agent-colab\n---"),
                ("agent-colab/bin/tool", "print('ok')"),
            ]),
            &dir,
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(root.join("bin/tool")).unwrap(),
            "print('ok')"
        );
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rejects_traversal_git_metadata_and_missing_skill_root() {
        for entries in [
            vec![("../escape", "bad")],
            vec![("SKILL.md", "valid"), (".git/config", "bad")],
            vec![("README.md", "not a skill")],
        ] {
            let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
            fs::create_dir_all(&dir).unwrap();
            assert!(extract_archive(&zip(&entries), &dir).is_err());
            fs::remove_dir_all(dir).unwrap();
        }
    }
}
