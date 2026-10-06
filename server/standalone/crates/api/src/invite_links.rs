use super::*;

pub(super) async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel): Path<uuid::Uuid>,
) -> Result<Json<colab_server_persistence::InviteLink>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .create_invite_link(user, channel)
        .await
        .map_err(|_| ApiError::internal("invite_creation_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("invite_forbidden"))
}
#[derive(Deserialize)]
pub(super) struct Accept {
    token: String,
}
pub(super) async fn accept(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Accept>,
) -> Result<Json<colab_server_persistence::InviteTarget>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .accept_invite_link(user, &body.token)
        .await
        .map_err(|_| ApiError::internal("invite_accept_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::bad_request("invite_expired_or_revoked"))
}
pub(super) async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .revoke_invite_link(user, id)
        .await
        .map_err(|_| ApiError::internal("invite_revoke_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("invite_forbidden"))
    }
}
pub(super) async fn landing(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Html<String>, ApiError> {
    let target = state
        .database
        .invite_target(&token)
        .await
        .map_err(|_| ApiError::internal("invite_lookup_failed"))?
        .ok_or_else(|| ApiError::bad_request("invite_expired_or_revoked"))?;
    let label = target
        .channel_name
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
    let token = percent_encoding::utf8_percent_encode(&token, percent_encoding::NON_ALPHANUMERIC)
        .to_string();
    Ok(Html(format!(
        "<!doctype html><html><head><meta name='referrer' content='no-referrer'><meta name='viewport' content='width=device-width'></head><body><h1>Share a Session with {label}</h1><p>This invitation adds your selected account as an ordinary member. You choose which Session to share.</p><p><a href='colab://join?token={token}&amp;action=share-session'>Open Colab</a></p><p>Not installed? <a href='https://github.com/kwgjjeffrey/agent-colab#installation' rel='noreferrer'>Install Colab</a>, then return to this invitation.</p></body></html>"
    )))
}
