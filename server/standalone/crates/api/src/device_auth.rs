use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChallengeRequest {
    public_key: String,
    purpose: String,
    user_id: Option<uuid::Uuid>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ProofRequest {
    nonce: String,
    signature: String,
    user_id: Option<uuid::Uuid>,
    #[serde(default)]
    name: String,
}

pub(super) async fn challenge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ChallengeRequest>,
) -> Result<Json<colab_server_persistence::DeviceChallenge>, ApiError> {
    if body.purpose == "bind" && Some(authenticated_user(&state, &headers).await?) != body.user_id {
        return Err(ApiError::forbidden("device_account_mismatch"));
    }
    state
        .database
        .device_challenge(&body.public_key, &body.purpose, body.user_id)
        .await
        .map(Json)
        .map_err(|_| ApiError::bad_request("invalid_device_challenge"))
}
pub(super) async fn discover(
    State(state): State<AppState>,
    Json(body): Json<ProofRequest>,
) -> Result<Json<Vec<colab_server_persistence::DeviceAccount>>, ApiError> {
    state
        .database
        .discover_device_accounts(&body.nonce, &body.signature, &body.name)
        .await
        .map(Json)
        .map_err(|_| ApiError::unauthorized("invalid_device_proof"))
}
pub(super) async fn login(
    State(state): State<AppState>,
    Json(body): Json<ProofRequest>,
) -> Result<Json<colab_server_persistence::CreatedSession>, ApiError> {
    let user = body
        .user_id
        .ok_or_else(|| ApiError::bad_request("account_required"))?;
    state
        .database
        .login_with_device(user, &body.nonce, &body.signature)
        .await
        .map(Json)
        .map_err(|_| ApiError::unauthorized("invalid_device_proof"))
}
pub(super) async fn bind(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ProofRequest>,
) -> Result<StatusCode, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .bind_login_device(
            user,
            &body.nonce,
            &body.signature,
            &body.name,
            Some(bearer_token(&headers)?),
        )
        .await
        .map_err(|_| ApiError::unauthorized("invalid_device_proof"))?;
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DeviceQuery {
    #[serde(default)]
    public_key: String,
}
pub(super) async fn devices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DeviceQuery>,
) -> Result<Json<Vec<colab_server_persistence::LoginDevice>>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_login_devices(user, &query.public_key)
        .await
        .map(Json)
        .map_err(|_| ApiError::internal("device_list_failed"))
}
pub(super) async fn unbind(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    match state.database.unbind_login_device(user, device).await {
        Ok(true) => Ok(StatusCode::NO_CONTENT),
        Ok(false) => Err(ApiError::bad_request("device_not_bound")),
        Err(_) => Err(ApiError::conflict(
            "device_unbind_failed_or_last_credential",
        )),
    }
}
