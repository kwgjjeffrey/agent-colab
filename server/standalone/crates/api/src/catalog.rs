use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Children { parent_id: Option<uuid::Uuid>, offset: Option<i64>, limit: Option<i64> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Placement { kind: String, item_id: uuid::Uuid, parent_id: Option<uuid::Uuid> }

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route("/v1/channels/{channel}/catalog-items", get(children))
        .route("/v1/channels/{channel}/catalog-items/position", patch(place))
}
async fn children(State(state): State<AppState>, headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>, Query(page): Query<Children>,
) -> Result<Json<Vec<colab_server_persistence::CatalogItem>>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    let rows = state.database.catalog_children(user, channel, page.parent_id,
        page.offset.unwrap_or(0), page.limit.unwrap_or(100)).await
        .map_err(|_| ApiError::internal("catalog_read_failed"))?
        .ok_or_else(|| ApiError::forbidden("catalog_access_forbidden"))?;
    Ok(Json(rows))
}
async fn place(State(state): State<AppState>, headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>, Json(body): Json<Placement>,
) -> Result<StatusCode, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    let moved = state.database.place_catalog_item(user, channel, &body.kind, body.item_id, body.parent_id).await
        .map_err(|_| ApiError::internal("catalog_move_failed"))?;
    if !moved { return Err(ApiError::bad_request("catalog_move_rejected")); }
    Ok(StatusCode::NO_CONTENT)
}
