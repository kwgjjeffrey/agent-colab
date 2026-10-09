use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct UpdateName {
    display_name: Option<String>,
    avatar_url: Option<String>,
    #[serde(default)]
    reset_avatar: bool,
}

pub(super) async fn get(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<colab_server_persistence::AccountProfile>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state.database.account_profile(user).await.map(Json).map_err(|_| ApiError::internal("profile_read_failed"))
}

pub(super) async fn update(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<UpdateName>) -> Result<Json<colab_server_persistence::AccountProfile>, ApiError> {
    if body.display_name.is_none() && body.avatar_url.is_none() && !body.reset_avatar {
        return Err(ApiError::bad_request("empty_profile_update"));
    }
    if body.display_name.is_some() && (body.avatar_url.is_some() || body.reset_avatar) {
        return Err(ApiError::bad_request("one_profile_action_required"));
    }
    if let Some(name) = &body.display_name {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
            return Err(ApiError::bad_request("invalid_display_name"));
        }
    }
    if body.reset_avatar && body.avatar_url.is_some() { return Err(ApiError::bad_request("conflicting_avatar_update")); }
    if let Some(avatar) = &body.avatar_url { validate_avatar(avatar)?; }
    let user = authenticated_user(&state, &headers).await?;
    let result = if let Some(name) = &body.display_name {
        state.database.set_account_name(user, name.trim()).await
    } else {
        state.database.set_account_avatar(user, body.avatar_url.as_deref()).await
    };
    result.map(Json).map_err(|_| ApiError::internal("profile_update_failed"))
}

fn validate_avatar(avatar: &str) -> Result<(), ApiError> {
    use base64::Engine;
    // Only bounded, inert JPEG data. No arbitrary URLs or executable SVG payloads.
    let payload = avatar.strip_prefix("data:image/jpeg;base64,").filter(|_| avatar.len() <= 90_000)
        .ok_or_else(|| ApiError::bad_request("invalid_avatar"))?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(payload).map_err(|_| ApiError::bad_request("invalid_avatar"))?;
    if bytes.len() > 65_536 || !bytes.starts_with(&[0xff, 0xd8, 0xff]) || !bytes.ends_with(&[0xff, 0xd9]) {
        return Err(ApiError::bad_request("invalid_avatar"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn avatar_rejects_urls_svg_invalid_base64_and_oversize() {
        for avatar in ["https://example.test/photo.jpg", "data:image/svg+xml;base64,AAAA", "data:image/jpeg;base64,???", "data:image/jpeg;base64,AAAA"] {
            assert!(validate_avatar(avatar).is_err());
        }
        assert!(validate_avatar(&format!("data:image/jpeg;base64,{}", "A".repeat(90_000))).is_err());
        assert!(validate_avatar("data:image/jpeg;base64,/9j//9k=").is_ok());
    }
}
