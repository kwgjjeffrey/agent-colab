use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct UpdateName {
    display_name: String,
}

pub(super) async fn get(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<colab_server_persistence::AccountProfile>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state.database.account_profile(user).await.map(Json).map_err(|_| ApiError::internal("profile_read_failed"))
}

pub(super) async fn update(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<UpdateName>) -> Result<Json<colab_server_persistence::AccountProfile>, ApiError> {
    let name = body.display_name.trim();
    if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
        return Err(ApiError::bad_request("invalid_display_name"));
    }
    let user = authenticated_user(&state, &headers).await?;
    state.database.set_account_name(user, name).await.map(Json).map_err(|_| ApiError::internal("profile_update_failed"))
}
