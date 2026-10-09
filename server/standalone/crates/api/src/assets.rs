use crate::*;
pub(super) async fn register(
    state: State<AppState>,
    headers: HeaderMap,
    channel: Path<uuid::Uuid>,
    body: Json<colab_server_persistence::RegisterAsset>,
) -> Result<Json<colab_server_persistence::AssetBinding>, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.assets.register",
        register_impl(state, headers, channel, body),
    )
    .await
}
async fn register_impl(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
    Json(body): Json<colab_server_persistence::RegisterAsset>,
) -> Result<Json<colab_server_persistence::AssetBinding>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    if !matches!(body.kind.as_str(), "files" | "session" | "skill")
        || body.name.trim().is_empty()
        || body.name.chars().count() > 120
        || body.source_key.len() != 64
        || !body.source_key.chars().all(|c| c.is_ascii_hexdigit())
        || body.existing_share_ids.len() > 1000
        || (body.kind == "session"
            && !matches!(
                body.source_adapter.as_str(),
                "codex-jsonl-v1"
                    | "claude-jsonl-v1"
                    | "myflicker-jsonl-v1"
                    | "myflicker-desktop-jsonl-v1"
            ))
        || (body.kind != "session" && body.source_adapter != "shadow-git-v1")
    {
        return Err(ApiError::bad_request("invalid_asset_source"));
    }
    state
        .database
        .register_asset(user, channel, &body)
        .await
        .map_err(|error| {
            if colab_server_persistence::is_unique_violation(&error) {
                ApiError::name_conflict("shared_item_name_conflict")
            } else {
                ApiError::bad_request("asset_source_registration_failed")
            }
        })?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))
}
pub(super) async fn binding(
    state: State<AppState>,
    headers: HeaderMap,
    id: Path<uuid::Uuid>,
) -> Result<Json<colab_server_persistence::AssetBinding>, ApiError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "server.assets.binding",
        binding_impl(state, headers, id),
    )
    .await
}
async fn binding_impl(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<colab_server_persistence::AssetBinding>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .asset_binding(user, id)
        .await
        .map_err(|_| ApiError::internal("asset_binding_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("asset_reference_forbidden"))
}
