//! Private keys and server proofs never cross the loopback response boundary.
use super::*;
use ring::{
    rand::SystemRandom,
    signature::{Ed25519KeyPair, KeyPair},
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceAccount {
    id: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StartResult {
    accounts: Vec<DeviceAccount>,
    requires_selection: bool,
}

async fn key(state: &AppState) -> Result<Ed25519KeyPair, LocalError> {
    let store = state.inner.store.lock().await;
    let encoded: Option<String> = store
        .query_row(
            "select value from local_settings where key='device_login_key_pkcs8'",
            [],
            |row| row.get(0),
        )
        .ok();
    let bytes = if let Some(encoded) = encoded {
        URL_SAFE_NO_PAD
            .decode(encoded)
            .map_err(LocalError::internal)?
    } else {
        let key = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
            .map_err(|_| LocalError::internal("device key generation failed"))?;
        store
            .execute(
                "insert into local_settings(key,value) values('device_login_key_pkcs8',?1)",
                [URL_SAFE_NO_PAD.encode(key.as_ref())],
            )
            .map_err(LocalError::internal)?;
        key.as_ref().to_vec()
    };
    Ed25519KeyPair::from_pkcs8(&bytes)
        .map_err(|_| LocalError::internal("device credential is damaged"))
}

async fn proof(
    state: &AppState,
    purpose: &str,
    user: Option<&str>,
    token: Option<&str>,
) -> Result<serde_json::Value, LocalError> {
    let key = key(state).await?;
    let mut request=state.inner.http.post(format!("{}/v1/auth/device/challenge",state.inner.server_url))
        .json(&serde_json::json!({"publicKey":URL_SAFE_NO_PAD.encode(key.public_key().as_ref()),"purpose":purpose,"userId":user}));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let response: serde_json::Value = response.json().await.map_err(LocalError::internal)?;
    let nonce = response["nonce"]
        .as_str()
        .ok_or_else(|| LocalError::internal("missing device challenge"))?;
    let name = std::env::var("HOSTNAME").unwrap_or_else(|_| "My device".into());
    Ok(
        serde_json::json!({"nonce":nonce,"signature":URL_SAFE_NO_PAD.encode(key.sign(nonce.as_bytes()).as_ref()),"userId":user,"name":name}),
    )
}

pub(super) async fn bind_current(
    state: &AppState,
    session: &ColabSession,
) -> Result<(), LocalError> {
    let body = proof(
        state,
        "bind",
        Some(&session.user.id),
        Some(&session.access_token),
    )
    .await?;
    let response = state
        .inner
        .http
        .post(format!("{}/v1/auth/device/bind", state.inner.server_url))
        .bearer_auth(&session.access_token)
        .json(&body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(())
}

pub(super) async fn start(State(state): State<AppState>) -> Result<Json<StartResult>, LocalError> {
    let _guard = state.inner.account_switch_lock.lock().await;
    // Existing installations must retain their account, not bootstrap a second one. The first
    // migration binds only accounts already authenticated on this installation.
    let migrated = {
        let store = state.inner.store.lock().await;
        store
            .query_row(
                "select value from local_settings where key='device_account_migration_complete'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .is_some()
    };
    if !migrated {
        let sessions: Vec<String> = {
            let store = state.inner.store.lock().await;
            let mut statement = store
                .prepare("select session_json from accounts where session_json is not null")
                .map_err(LocalError::internal)?;
            statement
                .query_map([], |row| row.get(0))
                .map_err(LocalError::internal)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(LocalError::internal)?
        };
        for encoded in sessions {
            let mut session: ColabSession =
                serde_json::from_str(&encoded).map_err(LocalError::internal)?;
            session.access_token = access_token_for_user(&state, &session.user.id).await?;
            bind_current(&state, &session).await?;
        }
        state.inner.store.lock().await.execute("insert into local_settings(key,value) values('device_account_migration_complete','1') on conflict(key) do nothing",[]).map_err(LocalError::internal)?;
    }
    let body = proof(&state, "discover", None, None).await?;
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/auth/device/accounts",
            state.inner.server_url
        ))
        .json(&body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let accounts: Vec<DeviceAccount> = response.json().await.map_err(LocalError::internal)?;
    if accounts.len() == 1 {
        Box::pin(login_account(&state, &accounts[0].id)).await?;
    } else {
        *state.inner.session.lock().await = None;
    }
    Ok(Json(StartResult {
        requires_selection: accounts.len() > 1,
        accounts,
    }))
}

pub(super) async fn login(
    State(state): State<AppState>,
    Json(body): Json<SwitchAccount>,
) -> Result<StatusCode, LocalError> {
    let _guard = state.inner.account_switch_lock.lock().await;
    Box::pin(login_account(&state, &body.user_id)).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn login_account(state: &AppState, user: &str) -> Result<(), LocalError> {
    let body = proof(state, "login", Some(user), None).await?;
    let response = state
        .inner
        .http
        .post(format!("{}/v1/auth/device/session", state.inner.server_url))
        .json(&body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let session: ColabSession = response.json().await.map_err(LocalError::internal)?;
    let _refresh = state.inner.auth_refresh_lock.lock().await;
    auth::save_account(state, &session).await?;
    let previous = state.inner.session.lock().await.replace(session);
    drop(_refresh);
    if let Err(error) = system::register_current_account_runtimes(state).await {
        let _refresh = state.inner.auth_refresh_lock.lock().await;
        {
            let mut store = state.inner.store.lock().await;
            let transaction = store.transaction().map_err(LocalError::internal)?;
            if let Some(previous) = &previous {
                transaction
                    .execute(
                        "update local_settings set value=?1 where key='current_user_id'",
                        [&previous.user.id],
                    )
                    .map_err(LocalError::internal)?;
            } else {
                transaction
                    .execute("delete from local_settings where key='current_user_id'", [])
                    .map_err(LocalError::internal)?;
            }
            transaction.commit().map_err(LocalError::internal)?;
        }
        *state.inner.session.lock().await = previous;
        return Err(error);
    }
    Ok(())
}

pub(super) async fn devices(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, LocalError> {
    let token = access_token(&state).await?;
    let key = key(&state).await?;
    let response = state
        .inner
        .http
        .get(format!("{}/v1/auth/devices", state.inner.server_url))
        .bearer_auth(token)
        .query(&[(
            "publicKey",
            URL_SAFE_NO_PAD.encode(key.public_key().as_ref()),
        )])
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}

pub(super) async fn unbind(
    State(state): State<AppState>,
    AxumPath(device): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
    let _guard = state.inner.account_switch_lock.lock().await;
    let token = access_token(&state).await?;
    let key = key(&state).await?;
    let response = state
        .inner
        .http
        .get(format!("{}/v1/auth/devices", state.inner.server_url))
        .bearer_auth(&token)
        .query(&[(
            "publicKey",
            URL_SAFE_NO_PAD.encode(key.public_key().as_ref()),
        )])
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let devices: Vec<serde_json::Value> = response.json().await.map_err(LocalError::internal)?;
    let removing_current = devices.iter().any(|item| {
        item["id"].as_str() == Some(device.as_str()) && item["current"].as_bool() == Some(true)
    });
    let response = state
        .inner
        .http
        .delete(format!(
            "{}/v1/auth/devices/{}",
            state.inner.server_url, device
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    // The successful deletion revoked this device's session; do not attempt another
    // authenticated request with that now-invalid credential before clearing local state.
    if removing_current {
        let user = current_user_id(&state).await?;
        *state.inner.session.lock().await = None;
        let store = state.inner.store.lock().await;
        store
            .execute(
                "update accounts set session_json=null where user_id=?1",
                [user],
            )
            .map_err(LocalError::internal)?;
        store
            .execute("delete from local_settings where key='current_user_id'", [])
            .map_err(LocalError::internal)?;
        state.inner.runtime_registration_changed.notify_one();
    }
    Ok(StatusCode::NO_CONTENT)
}
