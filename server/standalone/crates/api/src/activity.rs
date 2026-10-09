use super::*;
#[derive(Deserialize)]
pub(super) struct Page {
    page: Option<i64>,
    before: Option<String>,
    #[serde(rename = "beforeId")]
    before_id: Option<String>,
    limit: Option<i64>,
}
pub(super) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Query(page): Query<Page>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    let limit = page.limit.unwrap_or(20).clamp(1, 50);
    if let Some(number) = page.page {
        if number < 1 || page.before.is_some() || page.before_id.is_some() { return Err(ApiError::bad_request("invalid_activity_page")); }
        let (rows, total, number) = state.database.channel_activity_page(user, channel, number, limit).await
            .map_err(|_| ApiError::internal("activity_read_failed"))?
            .ok_or_else(|| ApiError::forbidden("channel_forbidden"))?;
        return Ok(Json(serde_json::json!({"items":rows,"total":total,"page":number,"pageSize":limit,"nextCursor":null})));
    }
    let mut rows = state
        .database
        .channel_activity(
            user,
            channel,
            page.before.as_deref(),
            page.before_id.as_deref().unwrap_or(""),
            limit + 1,
        )
        .await
        .map_err(|error| {
            let invalid = colab_server_persistence::invalid_activity_cursor(&error);
            if invalid {
                ApiError::bad_request("invalid_activity_cursor")
            } else {
                ApiError::internal("activity_read_failed")
            }
        })?
        .ok_or_else(|| ApiError::forbidden("channel_forbidden"))?;
    let more = rows.len() > limit as usize;
    rows.truncate(limit as usize);
    let next = if more {
        rows.last()
            .map(|r| serde_json::json!({"before":r.occurred_at,"beforeId":r.id}))
    } else {
        None
    };
    Ok(Json(serde_json::json!({"items":rows,"nextCursor":next})))
}
pub(super) async fn record_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .record_share_read(user, share)
        .await
        .map_err(|_| ApiError::internal("activity_write_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("share_forbidden"))
    }
}
