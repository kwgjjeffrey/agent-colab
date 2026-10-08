use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Children { parent_id: Option<uuid::Uuid>, offset: Option<i64>, limit: Option<i64> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Placement { kind: String, item_id: uuid::Uuid, parent_id: Option<uuid::Uuid>, before: Option<Anchor> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Anchor { kind:String, item_id:uuid::Uuid }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Create { name: String, parent_id: Option<uuid::Uuid> }
#[derive(Deserialize)]
struct Rename { name: String }

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route("/v1/channels/{channel}/catalog-items", get(children))
        .route("/v1/channels/{channel}/catalog-items/position", patch(place))
        .route("/v1/channels/{channel}/catalog-items/{kind}/{item}/trail", get(trail))
        .route("/v1/channels/{channel}/catalogs", post(create))
        .route("/v1/channels/{channel}/catalogs/{catalog}", patch(rename).delete(remove))
}
async fn trail(State(state):State<AppState>,headers:HeaderMap,Path((channel,kind,item)):Path<(uuid::Uuid,String,uuid::Uuid)>)->Result<Json<Vec<colab_server_persistence::CatalogItem>>,ApiError>{
    let user=authenticated_user(&state,&headers).await?;
    let rows=state.database.catalog_trail(user,channel,&kind,item).await.map_err(|_|ApiError::internal("catalog_trail_failed"))?.ok_or_else(||ApiError::forbidden("catalog_access_forbidden"))?;
    Ok(Json(rows))
}
fn name(value: &str) -> Result<&str, ApiError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 200 { return Err(ApiError::bad_request("invalid_catalog_name")); }
    Ok(value)
}
async fn create(State(state): State<AppState>, headers: HeaderMap, Path(channel): Path<uuid::Uuid>, Json(body): Json<Create>) -> Result<Json<colab_server_persistence::CanvasFolder>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    let row = state.database.create_canvas_folder(user, channel, body.parent_id, name(&body.name)?).await
        .map_err(|_| ApiError::bad_request("catalog_create_failed"))?
        .ok_or_else(|| ApiError::forbidden("catalog_access_forbidden"))?;
    Ok(Json(row))
}
async fn rename(State(state): State<AppState>, headers: HeaderMap, Path((channel, catalog)): Path<(uuid::Uuid, uuid::Uuid)>, Json(body): Json<Rename>) -> Result<Json<colab_server_persistence::CanvasFolder>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    let folders = state.database.list_canvas_folders(user, channel).await.map_err(|_| ApiError::internal("catalog_read_failed"))?
        .ok_or_else(|| ApiError::forbidden("catalog_access_forbidden"))?;
    if !folders.iter().any(|f| f.id == catalog) { return Err(ApiError::bad_request("catalog_not_found")); }
    let row = state.database.rename_canvas_folder(user, catalog, name(&body.name)?).await
        .map_err(|_| ApiError::bad_request("catalog_rename_failed"))?
        .ok_or_else(|| ApiError::forbidden("catalog_access_forbidden"))?;
    Ok(Json(row))
}
async fn remove(State(state): State<AppState>, headers: HeaderMap, Path((channel, catalog)): Path<(uuid::Uuid, uuid::Uuid)>) -> Result<StatusCode, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    if !state.database.delete_empty_catalog(user, channel, catalog).await.map_err(|_| ApiError::bad_request("catalog_delete_failed"))? {
        return Err(ApiError::bad_request("catalog_not_empty_or_unavailable"));
    }
    Ok(StatusCode::NO_CONTENT)
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
    let moved = state.database.position_catalog_item(user, channel, &body.kind, body.item_id, body.parent_id, body.before.map(|anchor|(anchor.kind,anchor.item_id))).await
        .map_err(|_| ApiError::internal("catalog_move_failed"))?;
    if !moved { return Err(ApiError::bad_request("catalog_move_rejected")); }
    Ok(StatusCode::NO_CONTENT)
}
