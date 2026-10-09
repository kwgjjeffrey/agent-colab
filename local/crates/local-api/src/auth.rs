//! Google OAuth, local account persistence and account switching.

use super::*;

pub(super) async fn start_google(
    State(state): State<AppState>,
    Query(query): Query<StartQuery>,
) -> Result<Json<StartResponse>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.auth.start-google", async {

    let flow_state = Uuid::new_v4().simple().to_string();
    let nonce = Uuid::new_v4().simple().to_string();
    let verifier = format!(
        "{}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    );
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let link_user_id = state.inner.session.lock().await.as_ref().map(|s| s.user.id.clone());
    state.inner.pending.lock().await.insert(
        flow_state.clone(),
        PendingLogin {
            verifier,
            nonce: nonce.clone(),
            link_user_id,
        },
    );
    *state.inner.last_error.lock().await = None;
    let mut url = Url::parse(&state.inner.google.auth_uri).map_err(LocalError::internal)?;
    url.query_pairs_mut()
        .append_pair("client_id", &state.inner.google.client_id)
        .append_pair("redirect_uri", &state.inner.callback_url)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("state", &flow_state)
        .append_pair("nonce", &nonce)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "select_account");
    if let Some(login_hint) = query.login_hint {
        url.query_pairs_mut().append_pair("login_hint", &login_hint);
    }
    Ok(Json(StartResponse {
        authorization_url: url.into(),
    }))

}).await
}
pub(super) async fn google_callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> Result<Html<&'static str>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.auth.google-callback", async {

    if let Some(error) = query.error {
        return fail(&state, format!("Google authorization failed: {error}")).await;
    }
    let code = query
        .code
        .ok_or_else(|| LocalError::bad_request("missing authorization code"))?;
    let flow_state = query
        .state
        .ok_or_else(|| LocalError::bad_request("missing OAuth state"))?;
    let pending = state
        .inner
        .pending
        .lock()
        .await
        .remove(&flow_state)
        .ok_or_else(|| LocalError::bad_request("unknown or expired OAuth state"))?;
    let token_response = state
        .inner
        .http
        .post(&state.inner.google.token_uri)
        .form(&[
            ("code", code.as_str()),
            ("client_id", state.inner.google.client_id.as_str()),
            ("client_secret", state.inner.google.client_secret.as_str()),
            ("redirect_uri", state.inner.callback_url.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", pending.verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|error| LocalError::internal(format!("Google token request failed: {error:?}")))?;
    if !token_response.status().is_success() {
        let details = token_response.text().await.unwrap_or_default();
        return fail(&state, format!("Google token exchange failed: {details}")).await;
    }
    let google: GoogleTokenResponse = token_response.json().await.map_err(LocalError::internal)?;
    let id_token = google
        .id_token
        .ok_or_else(|| LocalError::bad_request("Google response did not include an ID token"))?;
    let mut session_request = state
        .inner
        .http
        .post(format!("{}/v1/auth/google/session", state.inner.server_url))
        .json(&serde_json::json!({ "idToken": id_token, "nonce": pending.nonce }));
    if let Some(user) = pending.link_user_id {
        session_request = session_request.bearer_auth(access_token_for_user(&state, &user).await?);
    }
    let response = session_request
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        let details = response.text().await.unwrap_or_default();
        return fail(&state, format!("Colab session creation failed: {details}")).await;
    }
    let session: ColabSession = response.json().await.map_err(LocalError::internal)?;
    let _switch_guard = state.inner.account_switch_lock.lock().await;
    device_auth::bind_current(&state, &session).await?;
    device_auth::login_account(&state, &session.user.id).await?;
    *state.inner.last_error.lock().await = None;
    Ok(Html(
        "<!doctype html><html><head><meta name='viewport' content='width=device-width'><style>body{font-family:system-ui;margin:0;padding:64px;color:#17211e}a{display:inline-block;margin-top:12px;padding:12px 18px;border-radius:10px;background:#17211e;color:white;text-decoration:none;font-weight:650}p{color:#66716d}</style></head><body><h2>Signed in to Colab</h2><p>Your account is ready.</p><a href='agent-colab://auth-complete'>Open Colab</a></body></html>",
    ))

}).await
}
async fn fail(state: &AppState, message: String) -> Result<Html<&'static str>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.auth.fail", async {

    *state.inner.last_error.lock().await = Some(message.clone());
    Err(LocalError {
        status: StatusCode::BAD_REQUEST,
        message,
    })

}).await
}
pub(super) async fn auth_status(
    State(state): State<AppState>,
) -> Result<Json<AuthStatus>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.auth.auth-status", async {

    if state.inner.session.lock().await.is_some() {
        access_token(&state).await?;
    }
    let session = state.inner.session.lock().await.clone();
    let error = state.inner.last_error.lock().await.clone();
    let session = if external_auth::required() {
        if let Some(session) = session {
            let response = state.inner.http.get(format!("{}/v1/organizations", state.inner.server_url)).bearer_auth(&session.access_token).send().await.map_err(LocalError::internal)?;
            if response.status() == StatusCode::UNAUTHORIZED { None }
            else if !response.status().is_success() { return Err(remote_error(response).await); }
            else { Some(session) }
        } else { None }
    } else { session };
    Ok(Json(AuthStatus {
        authenticated: session.is_some(),
        user: session.map(|value| value.user),
        error,
    }))

}).await
}
pub(super) async fn list_accounts(
    State(state): State<AppState>,
) -> Result<Json<Vec<StoredAccount>>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.auth.list-accounts", async {

    let active = state
        .inner
        .session
        .lock()
        .await
        .as_ref()
        .map(|s| s.user.id.clone());
    let store = state.inner.store.lock().await;
    let mut statement = store
        .prepare(
            "select user_id,email,display_name,avatar_url from accounts order by last_used_at desc",
        )
        .map_err(LocalError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok(StoredAccount {
                user_id: row.get(0)?,
                email: row.get(1)?,
                display_name: row.get(2)?,
                avatar_url: row.get(3)?,
                active: false,
            })
        })
        .map_err(LocalError::internal)?;
    let mut accounts = Vec::new();
    for row in rows {
        let mut account = row.map_err(LocalError::internal)?;
        account.active = active.as_deref() == Some(&account.user_id);
        accounts.push(account);
    }
    Ok(Json(accounts))

}).await
}
pub(super) async fn switch_account(
    State(state): State<AppState>,
    Json(body): Json<SwitchAccount>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.auth.switch-account", async {

    let _switch_guard = state.inner.account_switch_lock.lock().await;
    let refresh_guard = state.inner.auth_refresh_lock.lock().await;
    let session: ColabSession = {
        let store = state.inner.store.lock().await;
        let value: String = store
            .query_row(
                "select session_json from accounts where user_id=$1",
                [&body.user_id],
                |row| row.get(0),
            )
            .map_err(|_| {
                LocalError::unauthorized("Saved session is unavailable; sign in with Google again")
            })?;
        serde_json::from_str(&value).map_err(LocalError::internal)?
    };
    let previous = state.inner.session.lock().await.replace(session);
    drop(refresh_guard);
    let result = async {
    let token = access_token(&state).await?;
    let validation = state
        .inner
        .http
        .get(format!("{}/v1/organizations", state.inner.server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if validation.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(LocalError::unauthorized(
            "Saved session expired; sign in with Google again",
        ));
    }
    if !validation.status().is_success() {
        return Err(remote_error(validation).await);
    }
    // An account switch is not complete until this account owns a registered device runtime.
    // The background stream manager discovers the account-scoped registration and connects it.
    system::register_current_account_runtimes(&state).await?;
    {
        let mut store = state.inner.store.lock().await;
        let transaction = store.transaction().map_err(LocalError::internal)?;
        transaction.execute("insert into local_settings(key,value) values('current_user_id',$1) on conflict(key) do update set value=excluded.value",[&body.user_id]).map_err(LocalError::internal)?;
        transaction
            .execute(
                "update accounts set last_used_at=current_timestamp where user_id=$1",
                [&body.user_id],
            )
            .map_err(LocalError::internal)?;
        transaction.commit().map_err(LocalError::internal)?;
    }
    Ok(StatusCode::NO_CONTENT)
    }.await;
    if result.is_err() {
        let _refresh_guard = state.inner.auth_refresh_lock.lock().await;
        let previous = if let Some(previous) = previous {
            let store = state.inner.store.lock().await;
            let stored: Option<String> = store.query_row("select session_json from accounts where user_id=?1", [&previous.user.id], |row| row.get(0)).ok();
            Some(stored.and_then(|value| serde_json::from_str(&value).ok()).unwrap_or(previous))
        } else { None };
        *state.inner.session.lock().await = previous;
    }
    result

}).await
}
pub(super) async fn logout(State(state): State<AppState>) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.auth.logout", async {

    let session = state
        .inner
        .session
        .lock()
        .await
        .take()
        .ok_or_else(|| LocalError::bad_request("Not signed in"))?;
    let _ = state
        .inner
        .http
        .post(format!("{}/v1/auth/logout", state.inner.server_url))
        .bearer_auth(&session.access_token)
        .send()
        .await;
    let store = state.inner.store.lock().await;
    store
        .execute("delete from accounts where user_id=$1", [&session.user.id])
        .map_err(LocalError::internal)?;
    store
        .execute("delete from local_settings where key='current_user_id'", [])
        .map_err(LocalError::internal)?;
    Ok(StatusCode::NO_CONTENT)

}).await
}
pub(super) async fn save_account(
    state: &AppState,
    session: &ColabSession,
) -> Result<(), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.auth.save-account", async {

    let encoded = serde_json::to_string(session).map_err(LocalError::internal)?;
    let store = state.inner.store.lock().await;
    store.execute("insert into accounts(user_id,email,display_name,avatar_url,session_json,last_used_at) values($1,$2,$3,$4,$5,current_timestamp) on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name,avatar_url=excluded.avatar_url,session_json=excluded.session_json,last_used_at=current_timestamp",rusqlite::params![session.user.id,session.user.email,session.user.display_name,session.user.avatar_url,encoded]).map_err(LocalError::internal)?;
    store.execute("insert into local_settings(key,value) values('current_user_id',$1) on conflict(key) do update set value=excluded.value",[&session.user.id]).map_err(LocalError::internal)?;
    Ok(())

}).await
}
