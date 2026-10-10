//! Feedback owns private evidence; Channel membership never grants review access.
use crate::*;
use colab_server_persistence::{
    FeedbackComment, FeedbackFilter, FeedbackStatusUpdate, FeedbackSubmission,
};
fn failure(error: anyhow::Error) -> ApiError {
    let message = error.to_string();
    match message.as_str() {
        "feedback_account_not_found" => ApiError::bad_request("feedback_account_not_found"),
        "feedback_review_forbidden" => ApiError::forbidden("feedback_review_forbidden"),
        "feedback_revision_conflict" => ApiError::conflict("feedback_revision_conflict"),
        "feedback_scope_mismatch" | "invalid_cursor" => {
            ApiError::bad_request("invalid_feedback_scope_or_cursor")
        }
        _ => ApiError::internal("feedback_operation_failed"),
    }
}
fn validate_filter(f: &FeedbackFilter) -> Result<(), ApiError> {
    if f.limit.is_some_and(|n| !(1..=100).contains(&n))
        || f.status
            .as_deref()
            .is_some_and(|s| !matches!(s, "all" | "unresolved" | "resolved" | "ignored"))
        || f.rating
            .as_deref()
            .is_some_and(|s| !matches!(s, "all" | "positive" | "negative" | "unrated"))
        || f.tag_match
            .as_deref()
            .is_some_and(|s| !matches!(s, "all" | "any"))
        || f.negative_tags.len() > 30
    {
        return Err(ApiError::bad_request("invalid_feedback_filter"));
    }
    for fields in [&f.include, &f.exclude].into_iter().flatten() {
        if fields
            .split(',')
            .filter(|field| !field.is_empty())
            .any(|s| {
                !matches!(
                    s,
                    "rating" | "tags" | "taskOutcome" | "taskTrajectory" | "comment" | "metadata"
                )
            })
        {
            return Err(ApiError::bad_request("invalid_feedback_fields"));
        }
    }
    for date in [&f.from, &f.to].into_iter().flatten() {
        if chrono::DateTime::parse_from_rfc3339(date).is_err() {
            return Err(ApiError::bad_request("invalid_feedback_date"));
        }
    }
    Ok(())
}
pub(super) async fn list_assets(
    State(s): State<AppState>,
    h: HeaderMap,
    Json(f): Json<FeedbackFilter>,
) -> Result<Json<serde_json::Value>, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.feedback.list-assets",
        async {
            let u = authenticated_user(&s, &h).await?;
            validate_filter(&f)?;
            s.database
                .list_feedback_assets(u, &f)
                .await
                .map(Json)
                .map_err(failure)
        },
    )
    .await
}
pub(super) async fn list_feedbacks(
    State(s): State<AppState>,
    h: HeaderMap,
    Json(f): Json<FeedbackFilter>,
) -> Result<Json<serde_json::Value>, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.feedback.list-feedbacks",
        async {
            let u = authenticated_user(&s, &h).await?;
            validate_filter(&f)?;
            s.database
                .list_feedbacks(u, &f)
                .await
                .map(Json)
                .map_err(failure)
        },
    )
    .await
}
pub(super) async fn submit(
    State(s): State<AppState>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    Json(b): Json<FeedbackSubmission>,
) -> Result<StatusCode, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.feedback.submit",
        async {
            let u = authenticated_user(&s, &h).await?;
            if b.asset_key.is_empty()
                || b.channel_key.is_empty()
                || b.skill_version.len() > 200
                || !matches!(
                    b.consumer_agent_type.as_str(),
                    "codex" | "claude" | "myflicker"
                )
                || chrono::DateTime::parse_from_rfc3339(&b.captured_at).is_err()
                || serde_json::to_vec(&b.metadata).map_or(true, |x| x.len() > 16384)
            {
                return Err(ApiError::bad_request("invalid_feedback_submission"));
            }
            if !s
                .database
                .feedback_can_report(u, &b)
                .await
                .map_err(failure)?
            {
                return Err(ApiError::forbidden("feedback_source_forbidden"));
            }
            if !s
                .database
                .submit_feedback(u, id, &b)
                .await
                .map_err(failure)?
            {
                return Err(ApiError::conflict("feedback_identity_conflict"));
            }
            Ok(StatusCode::NO_CONTENT)
        },
    )
    .await
}
pub(super) async fn comment(
    State(s): State<AppState>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    Json(b): Json<FeedbackComment>,
) -> Result<StatusCode, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.feedback.comment",
        async {
            let u = authenticated_user(&s, &h).await?;
            if !matches!(
                b.analysis_status.as_str(),
                "completed" | "failed" | "disabled"
            ) || b.comment_markdown.as_ref().is_some_and(|x| x.len() > 65536)
                || b.analysis_status == "completed"
                    && b.comment_markdown
                        .as_ref()
                        .is_none_or(|x| x.trim().is_empty())
            {
                return Err(ApiError::bad_request("invalid_feedback_comment"));
            }
            if !s
                .database
                .comment_feedback(u, id, &b)
                .await
                .map_err(failure)?
            {
                return Err(ApiError::conflict("feedback_comment_conflict"));
            }
            Ok(StatusCode::NO_CONTENT)
        },
    )
    .await
}
pub(super) async fn update_status(
    State(s): State<AppState>,
    h: HeaderMap,
    Json(b): Json<FeedbackStatusUpdate>,
) -> Result<Json<serde_json::Value>, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.feedback.update-status",
        async {
            let u = authenticated_user(&s, &h).await?;
            if b.feedback_ids.is_empty()
                || b.feedback_ids.len() > 100
                || !matches!(b.status.as_str(), "unresolved" | "resolved" | "ignored")
                || b.reason.trim().is_empty()
                || b.reason.len() > 8192
                || b.resolution_refs.len() > 30
                || b.resolution_refs.iter().any(|r| r.len() > 2048)
            {
                return Err(ApiError::bad_request("invalid_feedback_status_update"));
            }
            s.database
                .update_feedback_status(u, &b)
                .await
                .map(Json)
                .map_err(failure)
        },
    )
    .await
}
#[derive(Deserialize)]
pub(super) struct EvidenceQuery {
    digest: String,
}
pub(super) async fn upload(
    State(s): State<AppState>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    Query(q): Query<EvidenceQuery>,
    body: Body,
) -> Result<StatusCode, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.feedback.upload",
        async {
            let u = authenticated_user(&s, &h).await?;
            if !s.database.feedback_reporter(u, id).await.map_err(failure)? {
                return Err(ApiError::forbidden("feedback_reporter_required"));
            }
            if q.digest.len() != 64 || !q.digest.bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err(ApiError::bad_request("invalid_feedback_digest"));
            }
            if let Some((_, digest, _)) = s.database.feedback_blob(u, id).await.map_err(failure)? {
                return if digest == q.digest {
                    Ok(StatusCode::NO_CONTENT)
                } else {
                    Err(ApiError::conflict("feedback_evidence_conflict"))
                };
            }
            let key = uuid::Uuid::new_v4().simple().to_string();
            let size =
                blobs::write_bounded_with_limit(&s.blob_root, &key, body, 4 * 1024 * 1024).await?;
            let path = blobs::path(&s.blob_root, &key);
            let expected = q.digest.clone();
            let valid = tokio::task::spawn_blocking(move || {
                use sha2::Digest;
                use std::io::Read;
                let mut file = std::fs::File::open(path)?;
                let mut hash = sha2::Sha256::new();
                let mut buffer = [0; 65536];
                loop {
                    let n = file.read(&mut buffer)?;
                    if n == 0 {
                        break;
                    }
                    hash.update(&buffer[..n]);
                }
                Ok::<_, std::io::Error>(hex::encode(hash.finalize()) == expected)
            })
            .await;
            if !matches!(valid, Ok(Ok(true))) {
                let _ = s.blob_store.delete(&key).await;
                return Err(ApiError::bad_request("feedback_digest_mismatch"));
            }
            s.blob_store.publish_staged(&key).await?;
            match s
                .database
                .commit_feedback_blob(u, id, &key, &q.digest, size as i64)
                .await
            {
                Ok(true) => Ok(StatusCode::NO_CONTENT),
                result => {
                    let _ = s.blob_store.delete(&key).await;
                    match result {
                        Err(e) => Err(failure(e)),
                        _ => Err(ApiError::conflict("feedback_evidence_conflict")),
                    }
                }
            }
        },
    )
    .await
}
pub(super) async fn download(
    State(s): State<AppState>,
    h: HeaderMap,
    Path(id): Path<uuid::Uuid>,
) -> Result<Response, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.feedback.download",
        async {
            let u = authenticated_user(&s, &h).await?;
            let (key, digest, size) = s
                .database
                .feedback_blob(u, id)
                .await
                .map_err(failure)?
                .ok_or_else(|| ApiError::forbidden("feedback_evidence_forbidden"))?;
            let mut response = s.blob_store.response(&key, "application/x-ndjson").await?;
            response.headers_mut().insert(
                "x-colab-sha256",
                digest
                    .parse()
                    .map_err(|_| ApiError::internal("invalid_feedback_digest"))?,
            );
            response.headers_mut().insert(
                "x-colab-byte-size",
                size.to_string()
                    .parse()
                    .map_err(|_| ApiError::internal("invalid_feedback_size"))?,
            );
            Ok(response)
        },
    )
    .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all="camelCase")]
pub(super) struct AccessRequest { asset_key:String, email:Option<String>, action:Option<String> }
pub(super) async fn list_access(State(s):State<AppState>, h:HeaderMap, Json(b):Json<AccessRequest>) -> Result<Json<serde_json::Value>,ApiError> {
    colab_observability::registered_business(include_str!("../../../tracing/registry.json"),"server.feedback.list-feedback-access",async {
    let u=authenticated_user(&s,&h).await?;
    s.database.list_feedback_access(u,&b.asset_key).await.map(Json).map_err(failure)
    }).await
}
pub(super) async fn update_access(State(s):State<AppState>, h:HeaderMap, Json(b):Json<AccessRequest>) -> Result<Json<serde_json::Value>,ApiError> {
    colab_observability::registered_business(include_str!("../../../tracing/registry.json"),"server.feedback.update-feedback-access",async {
    let u=authenticated_user(&s,&h).await?;
    let email=b.email.as_deref().unwrap_or("").trim();let action=b.action.as_deref().unwrap_or("");
    if email.is_empty() || email.len()>320 || !matches!(action,"grant"|"revoke") { return Err(ApiError::bad_request("invalid_feedback_access")); }
    s.database.update_feedback_access(u,&b.asset_key,email,action).await.map(Json).map_err(failure)
    }).await
}
