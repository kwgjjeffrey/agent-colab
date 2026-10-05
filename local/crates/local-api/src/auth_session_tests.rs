use super::*;

fn session(id: &str, token: &str) -> ColabSession {
    ColabSession {
        access_token: token.into(),
        refresh_token: format!("refresh-{token}"),
        expires_in: 3600,
        expires_at: i64::MAX,
        user: User { id: id.into(), email: format!("{id}@example.test"), display_name: None, avatar_url: None },
    }
}

#[tokio::test]
async fn old_account_token_rotation_cannot_revert_a_completed_switch() {
    let root = std::env::temp_dir().join(format!("colab-auth-state-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let credentials = root.join("google.json");
    fs::write(&credentials, br#"{"installed":{"client_id":"test","client_secret":"test","auth_uri":"http://localhost","token_uri":"http://localhost","redirect_uris":["http://localhost"]}}"#).unwrap();
    let state = AppState::load(&credentials, root.join("local.sqlite3"), "http://localhost/callback".into(), "http://localhost".into()).unwrap();
    auth::save_account(&state, &session("old", "before")).await.unwrap();
    auth::save_account(&state, &session("new", "active")).await.unwrap();
    *state.inner.session.lock().await = Some(session("new", "active"));

    persist_refreshed_session(&state, &session("old", "rotated")).await.unwrap();
    assert_eq!(state.inner.session.lock().await.as_ref().unwrap().user.id, "new");
    let stored = state.inner.store.lock().await;
    let active: String = stored.query_row("select value from local_settings where key='current_user_id'", [], |row| row.get(0)).unwrap();
    assert_eq!(active, "new");
    let old: String = stored.query_row("select session_json from accounts where user_id='old'", [], |row| row.get(0)).unwrap();
    assert_eq!(serde_json::from_str::<ColabSession>(&old).unwrap().access_token, "rotated");
    drop(stored);
    persist_refreshed_session(&state, &session("new", "new-rotated")).await.unwrap();
    assert_eq!(state.inner.session.lock().await.as_ref().unwrap().access_token, "new-rotated");
    drop(state);
    fs::remove_dir_all(root).unwrap();
}
