//! Organization, Channel, membership and invitation handlers.

use super::*;

pub(super) async fn list_channels(
    State(state): State<AppState>,
) -> Result<Json<Vec<Channel>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.list-channels", async {

    let token = access_token(&state).await?;
    let organization_id = current_organization_id(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/organizations/{organization_id}/channels",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await;
    cached_discovery(&state, format!("channels:{organization_id}"), response).await

}).await
}
pub(super) async fn list_organizations(
    State(state): State<AppState>,
) -> Result<Json<Vec<Organization>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.list-organizations", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!("{}/v1/organizations", state.inner.server_url))
        .bearer_auth(token)
        .send()
        .await;
    let mut organizations: Vec<Organization> = cached_discovery(&state, "organizations".into(), response).await?.0;
    let user_id = current_user_id(&state).await?;
    let key = format!("current_organization:{user_id}");
    let stored = {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select value from local_settings where key=$1",
                [&key],
                |row| row.get::<_, String>(0),
            )
            .ok()
    };
    let active = stored
        .filter(|id| organizations.iter().any(|item| item.id == *id))
        .or_else(|| organizations.first().map(|item| item.id.clone()));
    if let Some(active) = active {
        {
            let store = state.inner.store.lock().await;
            store.execute("insert into local_settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value",[&key,&active]).map_err(LocalError::internal)?;
        }
        for organization in &mut organizations {
            organization.active = organization.id == active;
        }
    }
    Ok(Json(organizations))

}).await
}
pub(super) async fn create_organization(
    State(state): State<AppState>,
    Json(body): Json<CreateOrganization>,
) -> Result<(StatusCode, Json<Organization>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.create-organization", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .post(format!("{}/v1/organizations", state.inner.server_url))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let mut organization: Organization = response.json().await.map_err(LocalError::internal)?;
    set_current_organization(&state, &organization.id).await?;
    organization.active = true;
    Ok((StatusCode::CREATED, Json(organization)))

}).await
}
pub(super) async fn activate_organization(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.activate-organization", async {

    let organizations = list_organizations(State(state.clone())).await?.0;
    if !organizations
        .iter()
        .any(|organization| organization.id == id)
    {
        return Err(LocalError::bad_request("Unknown Organization"));
    }
    set_current_organization(&state, &id).await?;
    Ok(StatusCode::NO_CONTENT)

}).await
}

pub(super) async fn accept_invitation(
    State(state): State<AppState>,
    AxumPath(token): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.accept-invitation", async {

    let access = access_token(&state).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/organization-invitations/{token}/accept",
            state.inner.server_url
        ))
        .bearer_auth(access)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(StatusCode::NO_CONTENT)

}).await
}
pub(super) async fn create_channel(
    State(state): State<AppState>,
    Json(request): Json<CreateChannel>,
) -> Result<(StatusCode, Json<Channel>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.create-channel", async {

    let token = access_token(&state).await?;
    let organization_id = current_organization_id(&state).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/organizations/{organization_id}/channels",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .json(&request)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok((
        StatusCode::CREATED,
        Json(response.json().await.map_err(LocalError::internal)?),
    ))

}).await
}
pub(super) async fn update_channel(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<UpdateChannel>,
) -> Result<Json<Channel>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.update-channel", async {

    proxy_one(
        state
            .inner
            .http
            .patch(format!("{}/v1/channels/{id}", state.inner.server_url)),
        &state,
        &body,
    )
    .await

}).await
}
pub(super) async fn list_members(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<Vec<ChannelMember>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.list-members", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/channels/{id}/members",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))

}).await
}
pub(super) async fn search_people(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<Vec<OrganizationPerson>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.search-people", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .get(format!(
            "{}/v1/channels/{id}/organization/people",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .query(&query)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))

}).await
}
pub(super) async fn add_member(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<MemberMutation>,
) -> Result<(StatusCode, Json<AddMemberResponse>), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.add-member", async {

    let token = access_token(&state).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/channels/{id}/members",
            state.inner.server_url
        ))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let status = StatusCode::from_u16(response.status().as_u16()).map_err(LocalError::internal)?;
    let body = response.json().await.map_err(LocalError::internal)?;
    Ok((status, Json(body)))

}).await
}
pub(super) async fn update_member(
    State(state): State<AppState>,
    AxumPath((id, member)): AxumPath<(String, String)>,
    Json(body): Json<MemberMutation>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.update-member", async {

    proxy_empty(
        state.inner.http.patch(format!(
            "{}/v1/channels/{id}/members/{member}",
            state.inner.server_url
        )),
        &state,
        &body,
    )
    .await

}).await
}
pub(super) async fn remove_member(
    State(state): State<AppState>,
    AxumPath((id, member)): AxumPath<(String, String)>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.remove-member", async {

    proxy_delete(
        state.inner.http.delete(format!(
            "{}/v1/channels/{id}/members/{member}",
            state.inner.server_url
        )),
        &state,
    )
    .await

}).await
}
pub(super) async fn remove_invitation(
    State(state): State<AppState>,
    AxumPath((id, email)): AxumPath<(String, String)>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.collaboration.remove-invitation", async {

    proxy_delete(
        state.inner.http.delete(format!(
            "{}/v1/channels/{id}/invitations/{email}",
            state.inner.server_url
        )),
        &state,
    )
    .await

}).await
}

// Offline navigation uses only a previously authorized catalog for this exact account/tenant.
// A received authorization rejection must never fall back to stale membership.
pub(super) async fn cached_discovery<T: serde::de::DeserializeOwned + Serialize>(
    state: &AppState, scope: String, response: Result<reqwest::Response, impl std::fmt::Display>,
) -> Result<Json<Vec<T>>, LocalError> {
    let user = current_user_id(state).await?;
    let key = format!("offline_discovery:{user}:{scope}");
    match response {
        Ok(response) if response.status().is_success() => {
            let rows: Vec<T> = response.json().await.map_err(LocalError::internal)?;
            let value = serde_json::to_string(&rows).map_err(LocalError::internal)?;
            let store = state.inner.store.lock().await;
            store.execute("insert into local_settings(key,value) values(?1,?2) on conflict(key) do update set value=excluded.value", [&key, &value]).map_err(LocalError::internal)?;
            Ok(Json(rows))
        }
        Ok(response) if !matches!(response.status().as_u16(), 502 | 503 | 504) => {
            let store = state.inner.store.lock().await;
            store.execute("delete from local_settings where key=?1", [&key]).map_err(LocalError::internal)?;
            drop(store);
            Err(remote_error(response).await)
        }
        _ => {
            let store = state.inner.store.lock().await;
            let value: String = store.query_row("select value from local_settings where key=?1", [&key], |r| r.get(0))
                .map_err(|_| LocalError::internal("Offline catalog unavailable; connect once to load this account"))?;
            Ok(Json(serde_json::from_str(&value).map_err(LocalError::internal)?))
        }
    }
}
