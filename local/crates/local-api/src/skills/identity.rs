//! Delivery identity is independent of Agent slots; only locally issued, byte-verified markers are trusted.
use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Identity {
    delivery_id: String,
    server_url: String,
    asset_id: String,
    reference_id: String,
    channel_key: String,
    version: String,
    root_oid: String,
    skill_name: String,
    payload_hash: String,
}
fn schema(db: &rusqlite::Connection) -> Result<(), LocalError> {
    db.execute_batch("create table if not exists skill_delivery_identities(delivery_id text primary key,user_id text not null,identity_json text not null)").map_err(LocalError::internal)
}
fn payload_hash(root: &Path) -> anyhow::Result<String> {
    let mut files = vec![];
    collect_files(root, root, &mut files)?;
    files.sort();
    let mut hash = Sha256::new();
    for file in files {
        if file.starts_with(".colab")
            || file
                .components()
                .any(|part| part.as_os_str() == "__pycache__")
            || file.extension().is_some_and(|ext| ext == "pyc")
        {
            continue;
        }
        hash.update(file.to_string_lossy().as_bytes());
        hash.update(fs::read(root.join(file))?);
    }
    Ok(format!("{:x}", hash.finalize()))
}
pub(crate) async fn issue(
    s: &AppState,
    reference: &str,
    version: &str,
    source: &Path,
    root_oid: &str,
) -> Result<Identity, LocalError> {
    let user = current_user_id(s).await?;
    let binding = assets::binding(s, reference).await?;
    let channel_key = {
        let db = s.inner.store.lock().await;
        let channel:String=db.query_row("select channel_id from local_asset_references where reference_id=?1 and user_id=?2",rusqlite::params![reference,user],|r|r.get(0)).map_err(LocalError::internal)?;
        if channel.is_empty() { "unknown:legacy-install".into() } else { format!("channel:{channel}") }
    };
    let identity = Identity {
        delivery_id: Uuid::new_v4().to_string(),
        server_url: s.inner.server_url.clone(),
        asset_id: binding.asset_id,
        reference_id: reference.into(),
        channel_key: channel_key,
        version: version.into(),
        root_oid: root_oid.into(),
        skill_name: read_skill_metadata(source).map_err(LocalError::internal)?.0,
        payload_hash: payload_hash(source).map_err(LocalError::internal)?,
    };
    let db = s.inner.store.lock().await;
    schema(&db)?;
    db.execute(
        "insert into skill_delivery_identities values(?1,?2,?3)",
        rusqlite::params![
            identity.delivery_id,
            user,
            serde_json::to_string(&identity).map_err(LocalError::internal)?
        ],
    )
    .map_err(LocalError::internal)?;
    Ok(identity)
}
pub(crate) fn write(root: &Path, identity: &Identity) -> Result<(), LocalError> {
    let directory = root.join(".colab");
    // Colab owns this reserved delivery directory, never trust metadata supplied by a package.
    if directory.exists() {
        return Err(LocalError::conflict(
            "Skill package contains reserved .colab delivery metadata",
        ));
    }
    fs::create_dir(&directory).map_err(LocalError::internal)?;
    fs::write(
        directory.join("identity.json"),
        serde_json::to_vec(identity).map_err(LocalError::internal)?,
    )
    .map_err(LocalError::internal)
}
pub(crate) fn marker_root(path: &Path) -> Option<PathBuf> {
    path.ancestors()
        .take(64)
        .find(|root| root.join(".colab/identity.json").is_file())
        .map(Path::to_path_buf)
}
pub(crate) async fn recognize(
    s: &AppState,
    user: &str,
    path: &Path,
) -> Result<Option<(String, String, String, String)>, LocalError> {
    for root in path.ancestors().take(64) {
        let file = root.join(".colab/identity.json");
        if !file.is_file() {
            continue;
        }
        if fs::metadata(&file).map_err(LocalError::internal)?.len() > 8192 {
            return Ok(None);
        }
        let Ok(identity) =
            serde_json::from_slice::<Identity>(&fs::read(&file).map_err(LocalError::internal)?)
        else {
            return Ok(None);
        };
        let expected = {
            let db = s.inner.store.lock().await;
            schema(&db)?;
            db.query_row("select identity_json from skill_delivery_identities where delivery_id=?1 and user_id=?2",rusqlite::params![identity.delivery_id,user],|r|r.get::<_,String>(0)).ok()
        };
        if expected.as_deref()
            != Some(&serde_json::to_string(&identity).map_err(LocalError::internal)?)
            || identity.server_url != s.inner.server_url
        {
            return Ok(None);
        }
        if payload_hash(root).ok().as_deref() != Some(identity.payload_hash.as_str()) {
            return Ok(None);
        }
        return Ok(Some((
            format!("asset:{}", identity.asset_id),
            identity.channel_key,
            identity.root_oid,
            identity.skill_name,
        )));
    }
    Ok(None)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Deliver {
    output_directory: String,
    installer: Option<Vec<String>>,
    installed_directory: Option<String>,
}
pub(crate) async fn deliver(
    State(s): State<AppState>,
    AxumPath((reference, version)): AxumPath<(String, String)>,
    Json(b): Json<Deliver>,
) -> Result<Json<Value>, LocalError> {
    colab_observability::registered_business(
        include_str!("../../../../tracing/registry.json"),
        "core.skills.deliver",
        async {
            let output = PathBuf::from(&b.output_directory);
            let _guard = assets::publication_guard(&s, "skill-delivery", &b.output_directory).await;
            if !output.is_absolute() || output.exists() {
                return Err(LocalError::bad_request(
                    "Output must be a new absolute directory",
                ));
            }
            if b.installer.is_some() && b.installed_directory.is_none() {
                return Err(LocalError::bad_request(
                    "Installer requires installedDirectory for final verification",
                ));
            }
            let response = s
                .inner
                .http
                .get(format!(
                    "{}/v1/skills/{reference}/releases/{version}/artifact",
                    s.inner.server_url
                ))
                .bearer_auth(access_token(&s).await?)
                .send()
                .await
                .map_err(LocalError::internal)?;
            if !response.status().is_success() {
                return Err(remote_error(response).await);
            }
            let mut response = response;
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(LocalError::internal)? {
                if bytes.len() + chunk.len() > 25 * 1024 * 1024 {
                    return Err(LocalError::bad_request("Artifact exceeds delivery limit"));
                }
                bytes.extend_from_slice(&chunk);
            }
            let records = skill_releases::list(State(s.clone()), AxumPath(reference.clone()))
                .await?
                .0;
            let release = records
                .as_array()
                .and_then(|rows| rows.iter().find(|r| r["version"] == version))
                .ok_or_else(|| LocalError::bad_request("Release is not in available history"))?;
            let digest = format!("{:x}", Sha256::digest(&bytes));
            if release["artifactSha256"] != digest {
                return Err(LocalError::conflict(
                    "Artifact digest differs from release record",
                ));
            }
            let stage = s
                .inner
                .data_root
                .join("skill-release-staging")
                .join(Uuid::new_v4().to_string());
            fs::create_dir_all(&stage).map_err(LocalError::internal)?;
            let result = async {
                let source = skill_releases::extract_archive(&bytes, &stage)
                    .map_err(LocalError::internal)?;
                let identity = issue(
                    &s,
                    &reference,
                    &version,
                    &source,
                    release["rootOid"].as_str().ok_or_else(|| {
                        LocalError::bad_request("Release has no content revision")
                    })?,
                )
                .await?;
                install_directory_atomically(&source, &output, Some(&identity))?;
                let final_path = if let Some(command) = b.installer {
                    if command.is_empty() {
                        return Err(LocalError::bad_request("Installer command is empty"));
                    }
                    let mut process = tokio::process::Command::new(&command[0]);
                    process
                        .args(&command[1..])
                        .env("COLAB_SKILL_DELIVERY_DIRECTORY", &output)
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .kill_on_drop(true);
                    let status =
                        tokio::time::timeout(std::time::Duration::from_secs(300), process.status())
                            .await
                            .map_err(|_| {
                                LocalError::bad_request(
                                    "Project installer timed out; marked delivery retained",
                                )
                            })?
                            .map_err(LocalError::internal)?;
                    if !status.success() {
                        return Err(LocalError::bad_request(
                            "Project installer failed; marked delivery is retained",
                        ));
                    }
                    PathBuf::from(b.installed_directory.unwrap())
                } else {
                    output.clone()
                };
                let actual = fs::canonicalize(&final_path).map_err(LocalError::internal)?;
                if recognize(&s, &current_user_id(&s).await?, &actual.join("SKILL.md"))
                    .await?
                    .is_none()
                {
                    return Err(LocalError::conflict(
                        "Final Skill identity is missing or payload changed; delivery retained",
                    ));
                }
                Ok(Json(
                    json!({"directory":final_path,"version":version,"identityVerified":true}),
                ))
            }
            .await;
            let _ = fs::remove_dir_all(stage);
            result
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runtime_python_cache_does_not_change_delivery_identity() {
        let root = std::env::temp_dir().join(Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("SKILL.md"), "Original").unwrap();
        let original = payload_hash(&root).unwrap();
        fs::create_dir(root.join("__pycache__")).unwrap();
        fs::write(root.join("__pycache__/tool.pyc"), "generated").unwrap();
        assert_eq!(original, payload_hash(&root).unwrap());
        fs::write(root.join("SKILL.md"), "Changed").unwrap();
        assert_ne!(original, payload_hash(&root).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
