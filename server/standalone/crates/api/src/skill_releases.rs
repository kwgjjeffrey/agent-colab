use crate::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use colab_server_persistence::{RegisterAsset, SkillRelease};
use serde::Deserialize;
use sha2::{Digest, Sha256};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Registration {
    pub name: String,
    pub package_key: String,
    pub description: Option<String>,
}
pub(super) async fn register(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Json(b): Json<Registration>,
) -> Result<Json<colab_server_persistence::AssetBinding>, ApiError> {
    let user = authenticated_user(&s, &headers).await?;
    if b.name.trim().is_empty()
        || b.name.len() > 120
        || b.package_key.len() != 64
        || !b.package_key.bytes().all(|c| c.is_ascii_hexdigit())
    {
        return Err(ApiError::bad_request("invalid_skill_package"));
    }
    s.database
        .register_asset(
            user,
            channel,
            &RegisterAsset {
                kind: "skill".into(),
                name: b.name,
                description: b.description,
                source_adapter: "skill-release-v1".into(),
                source_key: b.package_key,
                existing_share_ids: vec![],
            },
        )
        .await
        .map_err(|_| ApiError::internal("skill_package_registration_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Publish {
    version: String,
    artifact_sha256: String,
    artifact: String,
    pack: String,
    root_oid: String,
    parent_root_oid: Option<String>,
    source_commit: Option<String>,
    #[serde(default)]
    release_notes: String,
}
pub(super) async fn list(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<Vec<SkillRelease>>, ApiError> {
    let u = authenticated_user(&s, &headers).await?;
    s.database
        .list_skill_releases(u, id)
        .await
        .map_err(|_| ApiError::internal("skill_releases_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("skill_release_access_forbidden"))
}
pub(super) async fn publish(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    Json(b): Json<Publish>,
) -> Result<Json<SkillRelease>, ApiError> {
    let u = authenticated_user(&s, &headers).await?;
    if s.database
        .skill_release_access(u, id, true)
        .await
        .map_err(|_| ApiError::internal("skill_release_lookup_failed"))?
        .is_none()
    {
        return Err(ApiError::forbidden("skill_publish_forbidden"));
    }
    if b.version.is_empty()
        || b.version.len() > 64
        || !b
            .version
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".-_".contains(&c))
        || !valid_oid(&b.root_oid)
        || b.parent_root_oid.as_deref().is_some_and(|r| !valid_oid(r))
        || b.release_notes.len() > 16384
    {
        return Err(ApiError::bad_request("invalid_skill_release"));
    }
    let artifact = STANDARD
        .decode(&b.artifact)
        .map_err(|_| ApiError::bad_request("invalid_artifact_encoding"))?;
    let pack = STANDARD
        .decode(&b.pack)
        .map_err(|_| ApiError::bad_request("invalid_pack_encoding"))?;
    if artifact.is_empty()
        || artifact.len() > 25 * 1024 * 1024
        || pack.is_empty()
        || pack.len() > 32 * 1024 * 1024
    {
        return Err(ApiError::payload_too_large("skill_release_too_large"));
    }
    if hex::encode(Sha256::digest(&artifact)) != b.artifact_sha256 {
        return Err(ApiError::bad_request("artifact_digest_mismatch"));
    }
    // Original archive and installable projection become reachable in one DB transaction.
    let archive_key = uuid::Uuid::new_v4().simple().to_string();
    let pack_key = uuid::Uuid::new_v4().simple().to_string();
    let sizes = (artifact.len() as i64, pack.len() as i64);
    for (key, bytes) in [(&archive_key, artifact), (&pack_key, pack)] {
        blobs::write_bounded(&s.blob_root, key, axum::body::Body::from(bytes)).await?;
        s.blob_store.publish_staged(key).await?;
    }
    match s
        .database
        .publish_skill_release(
            u,
            id,
            &b.version,
            &b.artifact_sha256,
            &archive_key,
            sizes.0,
            &b.root_oid,
            b.parent_root_oid.as_deref(),
            &pack_key,
            sizes.1,
            b.source_commit.as_deref(),
            &b.release_notes,
        )
        .await
    {
        Ok(Some(v)) => Ok(Json(v)),
        Ok(None) => Err(ApiError::forbidden("skill_publish_forbidden")),
        Err(e) if e.to_string().contains("conflict") => {
            Err(ApiError::conflict("skill_release_conflict"))
        }
        Err(e) if e.to_string().contains("storage quota exceeded") => {
            Err(ApiError::payload_too_large("storage_quota_exceeded"))
        }
        Err(_) => Err(ApiError::internal("skill_release_publish_failed")),
    }
}
#[derive(Deserialize)]
pub(super) struct Version {
    version: String,
}
pub(super) async fn promote(
    State(s): State<AppState>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    Json(b): Json<Version>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let u = authenticated_user(&s, &h).await?;
    if !s
        .database
        .promote_skill_release(u, id, &b.version)
        .await
        .map_err(|_| ApiError::internal("skill_promote_failed"))?
    {
        return Err(ApiError::forbidden("skill_promote_forbidden"));
    }
    Ok(Json(
        serde_json::json!({"promoted":true,"version":b.version}),
    ))
}
pub(super) async fn download(
    State(s): State<AppState>,
    h: HeaderMap,
    Path((id, version)): Path<(uuid::Uuid, String)>,
) -> Result<Response, ApiError> {
    let u = authenticated_user(&s, &h).await?;
    let key = s
        .database
        .skill_release_blob(u, id, &version)
        .await
        .map_err(|_| ApiError::internal("skill_artifact_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("skill_release_access_forbidden"))?;
    s.blob_store.response(&key, "application/zip").await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Publisher {
    user_id: uuid::Uuid,
    enabled: bool,
}
pub(super) async fn publisher(
    State(s): State<AppState>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    Json(b): Json<Publisher>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let u = authenticated_user(&s, &h).await?;
    if !s
        .database
        .grant_skill_publisher(u, id, b.user_id, b.enabled)
        .await
        .map_err(|_| ApiError::internal("skill_publisher_failed"))?
    {
        return Err(ApiError::forbidden("skill_publisher_forbidden"));
    }
    Ok(Json(serde_json::json!({"updated":true})))
}
