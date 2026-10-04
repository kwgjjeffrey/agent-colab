use anyhow::{Context, ensure};
use axum::{
    Json, Router,
    extract::{Path as AxumPath, Query, State},
    http::{HeaderMap, Request, StatusCode, header},
    middleware::{self, Next},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{delete, get, patch},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
};
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use url::Url;
use uuid::Uuid;

mod auth;
mod observability;
mod canvas;
mod canvas_codec;
mod update_status;
mod codex_runtime;
mod collaboration;
mod files;
mod messaging;
mod sessions;
mod skills;
mod system;
mod transfers;

#[derive(Clone)]
pub struct LocalSecurity {
    port: u16,
    bearer: Arc<str>,
}

impl LocalSecurity {
    pub fn new(port: u16, bearer: String) -> Self {
        Self {
            port,
            bearer: bearer.into(),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}
struct Inner {
    google: GoogleCredentials,
    callback_url: String,
    server_url: String,
    http: colab_observability::Client,
    pending: Mutex<HashMap<String, PendingLogin>>,
    session: Mutex<Option<ColabSession>>,
    /// Prevent two callers from presenting the same one-time refresh token concurrently. The
    /// server treats the second presentation as replay and revokes the session family.
    auth_refresh_lock: Mutex<()>,
    last_error: Mutex<Option<String>>,
    store: Mutex<rusqlite::Connection>,
    /// Serialize publication per Session share. The periodic publisher, an explicit sync, and a
    /// reader-triggered refresh may otherwise race with the same parent snapshot and cause a
    /// recoverable server CAS conflict to leak into the product UI.
    session_sync_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    data_root: PathBuf,
    /// One provider process owns every Colab-managed Codex thread for this Local Core process.
    /// Keeping this handle in application state is the ownership boundary: request handlers may
    /// enqueue work, but they must never create competing app-server writers.
    codex: codex_runtime::CodexManager,
}
#[derive(Clone, Deserialize)]
struct GoogleCredentialsFile {
    installed: GoogleCredentials,
}
#[derive(Clone, Deserialize)]
struct GoogleCredentials {
    client_id: String,
    client_secret: String,
    auth_uri: String,
    token_uri: String,
    redirect_uris: Vec<String>,
}
struct PendingLogin {
    verifier: String,
    nonce: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ColabSession {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
    #[serde(default)]
    expires_at: i64,
    user: User,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct User {
    id: String,
    email: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredAccount {
    user_id: String,
    email: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
    active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwitchAccount {
    user_id: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Channel {
    id: String,
    name: String,
    icon: Option<String>,
    role: String,
    created_at: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Organization {
    id: String,
    member_id: String,
    name: String,
    role: String,
    created_at: String,
    #[serde(default)]
    active: bool,
}
#[derive(Deserialize, Serialize)]
struct CreateOrganization {
    name: String,
}
#[derive(Deserialize, Serialize)]
struct CreateChannel {
    name: String,
    icon: Option<String>,
}
#[derive(Deserialize, Serialize)]
struct UpdateChannel {
    name: String,
    icon: Option<String>,
}
#[derive(Deserialize, Serialize)]
struct MemberMutation {
    email: Option<String>,
    role: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AddMemberResponse {
    status: String,
    email_delivery: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChannelMember {
    user_id: Option<String>,
    email: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
    role: String,
    status: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizationPerson {
    user_id: String,
    email: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileShare {
    id: String,
    channel_id: String,
    name: String,
    #[serde(default)]
    contributor_member_id: Option<String>,
    contributor_name: String,
    contributor_avatar_url: Option<String>,
    state: String,
    current_root_oid: Option<String>,
    can_withdraw: bool,
    updated_at: String,
    local_path: Option<String>,
    /// Local, device-specific synchronization state. It is not persisted on the Server.
    #[serde(default)]
    sync_state: Option<String>,
    #[serde(default)]
    sync_error: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileRevision {
    id: String,
    share_id: String,
    root_oid: String,
    parent_root_oid: Option<String>,
    byte_size: i64,
    created_at: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionShare {
    id: String,
    channel_id: String,
    name: String,
    #[serde(default)]
    contributor_member_id: Option<String>,
    source_adapter: String,
    contributor_name: String,
    contributor_avatar_url: Option<String>,
    state: String,
    current_snapshot_id: Option<String>,
    can_withdraw: bool,
    updated_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareLocalFiles {
    local_path: String,
    name: Option<String>,
    #[serde(default)]
    sync_excludes: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileEntry {
    path: String,
    name: String,
    kind: String,
    size: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileContent {
    path: String,
    content: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartResponse {
    authorization_url: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthStatus {
    authenticated: bool,
    user: Option<User>,
    error: Option<String>,
}
#[derive(Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartQuery {
    login_hint: Option<String>,
}
#[derive(Deserialize)]
struct GoogleTokenResponse {
    id_token: Option<String>,
}

impl AppState {
    pub fn load(
        credentials_path: impl AsRef<Path>,
        database_path: impl AsRef<Path>,
        callback_url: String,
        server_url: String,
    ) -> anyhow::Result<Self> {
        let bytes = fs::read(credentials_path.as_ref()).context("read Google OAuth credentials")?;
        let file: GoogleCredentialsFile =
            serde_json::from_slice(&bytes).context("parse Google OAuth credentials")?;
        ensure!(
            file.installed
                .redirect_uris
                .iter()
                .any(|uri| uri == "http://localhost"),
            "Google client does not permit loopback redirects"
        );
        if let Some(parent) = database_path.as_ref().parent() {
            fs::create_dir_all(parent).context("create local data directory")?;
        }
        let store =
            rusqlite::Connection::open(database_path.as_ref()).context("open local SQLite")?;
        #[cfg(unix)]
        fs::set_permissions(database_path.as_ref(), fs::Permissions::from_mode(0o600))
            .context("protect local SQLite")?;
        store.execute_batch("create table if not exists accounts(user_id text primary key,email text not null,display_name text,avatar_url text,session_json text,last_used_at text not null default current_timestamp);create table if not exists local_settings(key text primary key,value text);create table if not exists local_file_sources(share_id text primary key,channel_id text not null,source_path text not null,shadow_git_path text not null,last_root_oid text,updated_at text not null default current_timestamp);create table if not exists file_materializations(share_id text primary key,local_path text not null,last_root_oid text,updated_at text not null default current_timestamp);create table if not exists file_share_cache(share_id text primary key,name text not null,contributor_name text not null,contributor_avatar_url text,remote_updated_at text not null default '',updated_at text not null default current_timestamp);create table if not exists local_jobs(id text primary key,dedupe_key text not null unique,kind text not null,share_id text not null,user_id text not null,state text not null check(state in ('pending','running','failed','completed')),generation integer not null default 1,attempts integer not null default 0,next_attempt_at integer not null,last_error text,created_at text not null default current_timestamp,updated_at text not null default current_timestamp,completed_at text);create index if not exists local_jobs_due on local_jobs(state,next_attempt_at);").context("migrate local SQLite")?;
        store.execute_batch("create table if not exists local_session_sources(share_id text primary key,channel_id text not null,user_id text not null,source_path text not null,source_adapter text not null,source_thread_id text,last_byte_offset integer not null default 0,last_snapshot_id text,updated_at text not null default current_timestamp);create table if not exists session_materializations(share_id text not null,user_id text not null,snapshot_id text not null,raw_path text not null,updated_at text not null default current_timestamp,primary key(share_id,user_id));create table if not exists session_share_cache(share_id text primary key,name text not null,source_adapter text not null,contributor_name text not null,contributor_avatar_url text,remote_updated_at text not null default '',updated_at text not null default current_timestamp);create table if not exists local_session_catalog(catalog_id text primary key,provider text not null,thread_id text not null,name text not null,source_path text not null unique,source_adapter text not null,size_bytes integer not null,mtime_ns integer not null,updated_at integer not null);create index if not exists local_session_catalog_recent on local_session_catalog(updated_at desc);create index if not exists local_session_catalog_identity on local_session_catalog(provider,thread_id);").context("migrate Session cache")?;
        store.execute_batch("create table if not exists local_skill_catalog(source_id text primary key,source_path text not null unique,name text not null,description text,discovered_targets text not null,last_changed_at integer not null,content_fingerprint text not null,updated_at text not null default current_timestamp);create index if not exists local_skill_catalog_recent on local_skill_catalog(last_changed_at desc);create table if not exists local_skill_sources(share_id text primary key,channel_id text not null,user_id text not null,source_id text not null,source_path text not null,shadow_git_path text not null,last_root_oid text,updated_at text not null default current_timestamp);create table if not exists skill_share_cache(share_id text primary key,name text not null,description text,contributor_name text not null,contributor_avatar_url text,remote_updated_at text not null default '',updated_at text not null default current_timestamp);create table if not exists skill_materializations(share_id text not null,user_id text not null,local_path text not null,last_root_oid text not null,updated_at text not null default current_timestamp,primary key(share_id,user_id));create table if not exists skill_installations(share_id text not null,user_id text not null,target_agent text not null,installed_path text not null,installed_root_oid text not null,content_hash text not null,installed_at text not null default current_timestamp,primary key(share_id,user_id,target_agent));").context("migrate Skill cache")?;
        store.execute_batch("create table if not exists local_quick_transfers(transfer_id text primary key,read_token text not null,revoke_token text not null,expires_at text not null,item_kind text not null default '',item_name text not null default '',revoked_at text,created_at text not null default current_timestamp);create table if not exists received_transfer_items(transfer_id text not null,item_id text not null,kind text not null,name text not null,source_adapter text not null,local_path text not null,digest text not null,expires_at text not null,received_at text not null default current_timestamp,primary key(transfer_id,item_id));").context("migrate Quick Share receipts")?;
        store.execute_batch("create table if not exists agent_thread_bindings(channel_id text not null,blueprint_id text not null,runtime_id text not null,provider_thread_id text not null,adapter_version integer not null default 3,updated_at text not null default current_timestamp,primary key(channel_id,blueprint_id));create table if not exists agent_command_receipts(request_id text primary key,status text not null check(status in ('completed')),updated_at text not null default current_timestamp);").context("migrate Agent runtime bindings")?;
        store.execute_batch("create table if not exists canvas_replicas(account_id text not null,canvas_id text not null,schema_version integer not null default 1,snapshot_bytes blob not null,last_server_seq integer not null default 0,updated_at text not null default current_timestamp,primary key(account_id,canvas_id));create table if not exists canvas_outbox(account_id text not null,canvas_id text not null,client_update_id text not null,update_bytes blob not null,state text not null check(state in ('pending','acked')),attempt_count integer not null default 0,next_attempt_at integer not null default 0,last_error text,server_seq integer,created_at text not null default current_timestamp,updated_at text not null default current_timestamp,primary key(account_id,canvas_id,client_update_id));create index if not exists canvas_outbox_due on canvas_outbox(account_id,state,next_attempt_at);").context("migrate Canvas replicas")?;
        let has_adapter_version = store
            .prepare("pragma table_info(agent_thread_bindings)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|column| column == "adapter_version");
        if !has_adapter_version {
            // Old bindings may reference `codex exec` rollouts. They can be read by id but do
            // not appear as owner-visible Codex Desktop tasks. This migration records them as
            // version 1 so the persistent app-server adapter will create a safe replacement.
            store
                .execute(
                    "alter table agent_thread_bindings add column adapter_version integer not null default 1",
                    [],
                )
                .context("add Agent runtime adapter version")?;
        }
        for (column, definition) in [
            (
                "item_kind",
                "alter table local_quick_transfers add column item_kind text not null default ''",
            ),
            (
                "item_name",
                "alter table local_quick_transfers add column item_name text not null default ''",
            ),
            (
                "revoked_at",
                "alter table local_quick_transfers add column revoked_at text",
            ),
        ] {
            let exists = store
                .prepare("pragma table_info(local_quick_transfers)")?
                .query_map([], |row| row.get::<_, String>(1))?
                .filter_map(Result::ok)
                .any(|name| name == column);
            if !exists {
                store.execute(definition, [])?;
            }
        }
        // `local_session_catalog` is a disposable projection. Alpha builds may replace its
        // schema instead of migrating cache rows; the background index reconstructs it from the
        // provider-owned transcripts immediately after startup.
        let has_catalog_id = store
            .prepare("pragma table_info(local_session_catalog)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|name| name == "catalog_id");
        if !has_catalog_id {
            store.execute_batch("drop table local_session_catalog;create table local_session_catalog(catalog_id text primary key,provider text not null,thread_id text not null,name text not null,source_path text not null unique,source_adapter text not null,size_bytes integer not null,mtime_ns integer not null,updated_at integer not null);create index local_session_catalog_recent on local_session_catalog(updated_at desc);create index local_session_catalog_identity on local_session_catalog(provider,thread_id);")?;
        }
        let has_job_generation = store
            .prepare("pragma table_info(local_jobs)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|name| name == "generation");
        if !has_job_generation {
            store.execute(
                "alter table local_jobs add column generation integer not null default 1",
                [],
            )?;
        }
        // A process may die after claiming a job. Running is only a lease, never a terminal fact;
        // resetting it at startup makes every accepted job recoverable after a crash or upgrade.
        store.execute("update local_jobs set state='pending',next_attempt_at=unixepoch(),updated_at=current_timestamp where state='running'", [])?;
        for (table, column) in [
            ("local_file_sources", "user_id"),
            ("file_materializations", "user_id"),
        ] {
            let exists = store
                .prepare(&format!("pragma table_info({table})"))?
                .query_map([], |row| row.get::<_, String>(1))?
                .filter_map(Result::ok)
                .any(|name| name == column);
            if !exists {
                store.execute(&format!("alter table {table} add column {column} text"), [])?;
            }
        }
        for (column, definition) in [
            ("contributor_avatar_url", "text"),
            ("remote_updated_at", "text not null default ''"),
        ] {
            let exists = store
                .prepare("pragma table_info(file_share_cache)")?
                .query_map([], |row| row.get::<_, String>(1))?
                .filter_map(Result::ok)
                .any(|name| name == column);
            if !exists {
                store.execute(
                    &format!("alter table file_share_cache add column {column} {definition}"),
                    [],
                )?;
            }
        }
        let database_path =
            fs::canonicalize(database_path.as_ref()).context("canonicalize local SQLite path")?;
        let data_root = database_path
            .parent()
            .unwrap_or_else(|| Path::new(".data"))
            .to_path_buf();
        // The first development build stored absolute paths under the repository. When the data
        // directory is migrated to the OS-managed location, repair those internal paths from the
        // stable share id instead of retaining references to the checkout.
        {
            let mut statement = store.prepare("select share_id from local_file_sources")?;
            let share_ids = statement
                .query_map([], |row| row.get::<_, String>(0))?
                .filter_map(Result::ok)
                .collect::<Vec<_>>();
            drop(statement);
            for share_id in share_ids {
                let shadow = data_root.join("shadows").join(format!("{share_id}.git"));
                if shadow.exists() {
                    store.execute(
                        "update local_file_sources set shadow_git_path=?2 where share_id=?1",
                        rusqlite::params![share_id, shadow.to_string_lossy()],
                    )?;
                }
            }
            let mut statement = store.prepare("select share_id from file_materializations")?;
            let share_ids = statement
                .query_map([], |row| row.get::<_, String>(0))?
                .filter_map(Result::ok)
                .collect::<Vec<_>>();
            drop(statement);
            for share_id in share_ids {
                let materialized = data_root.join("materialized").join(&share_id);
                if materialized.exists() {
                    store.execute(
                        "update file_materializations set local_path=?2 where share_id=?1",
                        rusqlite::params![share_id, materialized.to_string_lossy()],
                    )?;
                }
            }
        }
        let has_session = store
            .prepare("pragma table_info(accounts)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|name| name == "session_json");
        if !has_session {
            store
                .execute("alter table accounts add column session_json text", [])
                .context("add local account session storage")?;
        }
        let current: Option<String> = store
            .query_row(
                "select value from local_settings where key='current_user_id'",
                [],
                |row| row.get(0),
            )
            .ok();
        let session=current.and_then(|id|store.query_row("select session_json from accounts where user_id=$1 and session_json is not null",[id],|row|row.get::<_,String>(0)).ok()).and_then(|value|serde_json::from_str(&value).ok());
        let codex = codex_runtime::CodexManager::new(messaging::codex_binary());
        Ok(Self {
            inner: Arc::new(Inner {
                google: file.installed,
                callback_url,
                server_url,
                http: colab_observability::client(),
                pending: Mutex::new(HashMap::new()),
                session: Mutex::new(session),
                auth_refresh_lock: Mutex::new(()),
                last_error: Mutex::new(None),
                store: Mutex::new(store),
                session_sync_locks: Mutex::new(HashMap::new()),
                data_root,
                codex,
            }),
        })
    }

    /// Starts the GUI-independent filesystem watcher used by automatic file publication.
    ///
    /// Native watcher events are only wake-up hints: they are debounced for two seconds and then
    /// routed through `publish_source`, which performs a complete shadow-Git scan. This separation
    /// keeps correctness independent from event coalescing, duplicate delivery and watcher
    /// overflow. Sources are rediscovered periodically so newly shared paths and account switches
    /// do not require restarting Local Core.
    pub fn start_file_sync(&self) {
        files::start_file_sync(self);
        sessions::start_session_sync(self);
        skills::start_skill_sync(self);
        messaging::start_agent_runtime(self);
        canvas::start_sync(self);
    }
}

pub fn router(state: AppState, security: LocalSecurity) -> Router {
    let gui_root = std::env::var_os("COLAB_GUI_ROOT").map(std::path::PathBuf::from);
    let router = Router::new()
        // The security middleware intercepts this route before the placeholder handler and trades
        // the one-time URL bearer for an HttpOnly cookie.
        .route("/bootstrap", get(|| async { StatusCode::NOT_FOUND }))
        .route("/v1/status", get(status))
        .route("/v1/observability/config", get(observability::config))
        .route("/v1/observability/clock", get(colab_observability::clock_reply))
        .route("/v1/observability/traces", axum::routing::post(observability::traces).layer(axum::extract::DefaultBodyLimit::max(1024*1024)))
        .route("/v1/system/installation", get(system::installation_status))
        .route("/v1/system/update-progress", get(system::update_progress))
        .route(
            "/v1/system/update",
            axum::routing::post(system::update_installation),
        )
        .route(
            "/v1/system/restart",
            axum::routing::post(system::restart_managed),
        )
        .route(
            "/v1/system/update-shell",
            axum::routing::post(system::update_shell),
        )
        .route(
            "/v1/system/agents/{agent}/install",
            axum::routing::post(system::install_agent),
        )
        .route(
            "/v1/system/agents/{agent}/uninstall",
            axum::routing::post(system::uninstall_agent),
        )
        .route(
            "/v1/system/agents/{agent}/default",
            axum::routing::post(system::set_default_agent),
        )
        .route(
            "/v1/system/agents/{agent}/open",
            axum::routing::post(system::open_agent),
        )
        .route("/v1/system/choose-path", get(choose_path))
        .route("/v1/auth/google/start", get(auth::start_google))
        .route("/v1/auth/google/callback", get(auth::google_callback))
        .route("/v1/auth/status", get(auth::auth_status))
        .route("/v1/auth/accounts", get(auth::list_accounts))
        .route("/v1/auth/switch", axum::routing::post(auth::switch_account))
        .route("/v1/auth/logout", axum::routing::post(auth::logout))
        .route(
            "/v1/organizations",
            get(collaboration::list_organizations).post(collaboration::create_organization),
        )
        .route(
            "/v1/organizations/{organization_id}/activate",
            axum::routing::post(collaboration::activate_organization),
        )
        .route(
            "/v1/organization-invitations/{token}/accept",
            axum::routing::post(collaboration::accept_invitation),
        )
        .route(
            "/v1/channels",
            get(collaboration::list_channels).post(collaboration::create_channel),
        )
        .route(
            "/v1/channels/{channel_id}",
            patch(collaboration::update_channel),
        )
        .route(
            "/v1/channels/{channel_id}/members",
            get(collaboration::list_members).post(collaboration::add_member),
        )
        .route(
            "/v1/channels/{channel_id}/organization/people",
            get(collaboration::search_people),
        )
        .route(
            "/v1/channels/{channel_id}/members/{member_id}",
            patch(collaboration::update_member).delete(collaboration::remove_member),
        )
        .route(
            "/v1/channels/{channel_id}/invitations/{email}",
            delete(collaboration::remove_invitation),
        )
        .route(
            "/v1/channels/{channel_id}/participants",
            get(messaging::participants),
        )
        .route(
            "/v1/channels/{channel_id}/agent-runtimes",
            get(messaging::runtimes),
        )
        .route(
            "/v1/channels/{channel_id}/blueprints",
            get(messaging::blueprints).post(messaging::create_blueprint),
        )
        .route(
            "/v1/channels/{channel_id}/blueprints/{blueprint_id}",
            patch(messaging::update_blueprint).delete(messaging::delete_blueprint),
        )
        .route(
            "/v1/channels/{channel_id}/blueprints/{blueprint_id}/selection",
            patch(messaging::select_blueprint),
        )
        .route(
            "/v1/channels/{channel_id}/messages",
            get(messaging::messages).post(messaging::send_message),
        )
        .route("/v1/channels/{channel_id}/messages/{message_id}", get(messaging::message_by_id))
        .route(
            "/v1/channels/{channel_id}/agent-requests",
            get(messaging::agent_requests).post(messaging::create_agent_request),
        )
        .route(
            "/v1/agent-requests/{request_id}/context",
            get(messaging::agent_request_context),
        )
        .route(
            "/v1/agent-requests/{request_id}/reply",
            axum::routing::post(messaging::agent_request_reply),
        )
        .route(
            "/v1/agent-requests/{request_id}/events",
            get(messaging::agent_request_events),
        )
        .route("/v1/messages/stream", get(messaging::stream))
        .route(
            "/v1/channels/{channel_id}/canvases",
            get(canvas::list_canvases).post(canvas::create_canvas),
        )
        .route("/v1/canvases/{canvas_id}", patch(canvas::rename_canvas))
        .route(
            "/v1/canvases/{canvas_id}/send-to-agent",
            axum::routing::post(canvas::send_to_agent),
        )
        .route(
            "/v1/channels/{channel_id}/canvas-folders",
            get(canvas::list_folders).post(canvas::create_folder),
        )
        .route(
            "/v1/canvas-folders/{folder_id}",
            patch(canvas::rename_folder),
        )
        .route(
            "/v1/canvases/{canvas_id}/document",
            get(canvas::read_document),
        )
        .route(
            "/v1/canvases/{canvas_id}/apply-patch",
            axum::routing::post(canvas::apply_patch),
        )
        .route(
            "/v1/canvases/{canvas_id}/updates",
            get(canvas::updates).post(canvas::submit_update),
        )
        .route(
            "/v1/channels/{channel_id}/files",
            get(files::list_file_shares),
        )
        .route(
            "/v1/channels/{channel_id}/files/share",
            axum::routing::post(files::share_local_files),
        )
        .route(
            "/v1/files/inspect-source",
            axum::routing::post(files::inspect_file_source),
        )
        .route(
            "/v1/files/{share_id}/publish",
            axum::routing::post(files::publish_local_files),
        )
        .route(
            "/v1/files/{share_id}/materialize",
            axum::routing::post(files::materialize_file_share),
        )
        .route(
            "/v1/files/{share_id}/retry",
            axum::routing::post(files::retry_file_sync),
        )
        .route(
            "/v1/files/{share_id}/sync-scope",
            get(files::get_sync_scope).patch(files::update_sync_scope),
        )
        .route(
            "/v1/files/{share_id}/tree",
            get(files::list_local_file_tree),
        )
        .route(
            "/v1/files/{share_id}/content",
            get(files::read_local_file_content),
        )
        .route(
            "/v1/files/{share_id}/raw",
            get(files::stream_local_file_content),
        )
        .route("/v1/files/{share_id}", delete(files::withdraw_file_share))
        .route("/v1/session-sources", get(sessions::list_session_sources))
        .route(
            "/v1/channels/{channel_id}/sessions",
            get(sessions::list_session_shares),
        )
        .route(
            "/v1/channels/{channel_id}/sessions/share",
            axum::routing::post(sessions::share_session),
        )
        .route(
            "/v1/sessions/{share_id}/sync",
            axum::routing::post(sessions::sync_session),
        )
        .route(
            "/v1/sessions/{share_id}/read",
            axum::routing::post(sessions::read_session),
        )
        .route(
            "/v1/sessions/{share_id}",
            delete(sessions::withdraw_session),
        )
        .route("/v1/skill-sources", get(skills::list_skill_sources))
        .route(
            "/v1/channels/{channel_id}/skills",
            get(skills::list_skill_shares),
        )
        .route(
            "/v1/channels/{channel_id}/skills/share",
            axum::routing::post(skills::share_skill),
        )
        .route(
            "/v1/skills/{share_id}/materialize",
            axum::routing::post(skills::materialize_skill),
        )
        .route(
            "/v1/skills/{share_id}/installations",
            get(skills::list_installations),
        )
        .route(
            "/v1/skills/{share_id}/targets/{target}/ensure",
            axum::routing::post(skills::ensure_installed),
        )
        .route(
            "/v1/skills/{share_id}/targets/{target}",
            delete(skills::uninstall),
        )
        .route("/v1/skills/{share_id}", delete(skills::withdraw_skill))
        .route(
            "/v1/transfers",
            get(transfers::list_transfers).post(transfers::create_transfer),
        )
        .route(
            "/v1/transfers/{transfer_id}",
            get(transfers::get_transfer).patch(transfers::update_transfer),
        )
        .route(
            "/v1/transfers/receive",
            axum::routing::post(transfers::receive_transfer),
        )
        .route(
            "/v1/transfers/revoke",
            axum::routing::post(transfers::revoke_transfer),
        )
        .with_state(state)
        .layer(middleware::from_fn(colab_observability::http_span))
        .layer(
            CorsLayer::new()
                .allow_origin([
                    "http://localhost:1420".parse().unwrap(),
                    "http://127.0.0.1:1420".parse().unwrap(),
                    "tauri://localhost".parse().unwrap(),
                    "http://tauri.localhost".parse().unwrap(),
                    "https://tauri.localhost".parse().unwrap(),
                ])
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        )
        .layer(middleware::from_fn_with_state(
            security,
            enforce_local_security,
        ));
    // Local Core is the stable GUI host. Electron may open this origin in a native
    // window, while headless installations use the same URL in the system browser.
    // Static resources are independently activated by setup via COLAB_GUI_ROOT.
    match gui_root {
        Some(root) => router.fallback_service(
            tower_http::services::ServeDir::new(root).append_index_html_on_directories(true),
        ),
        None => router,
    }
}

async fn enforce_local_security(
    State(security): State<LocalSecurity>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let headers = request.headers();
    let expected_host = format!("localhost:{}", security.port);
    let alternate_host = format!("127.0.0.1:{}", security.port);
    if !header_equals(headers, header::HOST, &[&expected_host, &alternate_host]) {
        return StatusCode::BAD_REQUEST.into_response();
    }

    if let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    {
        let expected_origin = format!("http://{expected_host}");
        let alternate_origin = format!("http://{alternate_host}");
        let allowed = [
            expected_origin.as_str(),
            alternate_origin.as_str(),
            "http://localhost:1420",
            "http://127.0.0.1:1420",
        ]
        .contains(&origin);
        if !allowed {
            return StatusCode::FORBIDDEN.into_response();
        }
    }

    let path = request.uri().path();
    // Bootstrap is handled in middleware because Router application state belongs to business
    // handlers. The bearer is accepted once and converted to an HttpOnly cookie.
    if path == "/bootstrap" {
        let valid = request
            .uri()
            .query()
            .and_then(|query| {
                url::form_urlencoded::parse(query.as_bytes()).find(|(key, _)| key == "token")
            })
            .is_some_and(|(_, value)| value == security.bearer.as_ref());
        if !valid {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        return (
            [(
                header::SET_COOKIE,
                format!(
                    "colab_local_token={}; HttpOnly; SameSite=Strict; Path=/",
                    security.bearer
                ),
            )],
            Redirect::to("/"),
        )
            .into_response();
    }
    let public = path == "/v1/auth/google/callback" || !path.starts_with("/v1/");
    if !public {
        let bearer_header = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "));
        let cookie = headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| {
                value
                    .split(';')
                    .map(str::trim)
                    .find_map(|part| part.strip_prefix("colab_local_token="))
            });
        if bearer_header != Some(security.bearer.as_ref())
            && cookie != Some(security.bearer.as_ref())
        {
            return StatusCode::UNAUTHORIZED.into_response();
        }
    }
    next.run(request).await
}

fn header_equals(headers: &HeaderMap, name: header::HeaderName, allowed: &[&str]) -> bool {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| allowed.contains(&value))
}

#[cfg(test)]
mod security_tests {
    use super::*;

    #[test]
    fn host_header_requires_the_bound_loopback_port() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "localhost:43123".parse().unwrap());
        assert!(header_equals(
            &headers,
            header::HOST,
            &["localhost:43123", "127.0.0.1:43123"]
        ));
        headers.insert(header::HOST, "evil.example".parse().unwrap());
        assert!(!header_equals(
            &headers,
            header::HOST,
            &["localhost:43123", "127.0.0.1:43123"]
        ));
    }
}
async fn status() -> Json<colab_local_core::LocalStatus> {
    Json(colab_local_core::status())
}

#[derive(Deserialize)]
struct ChoosePathQuery {
    directory: Option<bool>,
}

/// Browser-hosted GUI cannot obtain a stable absolute path from the Web File API.
/// Local Core therefore owns the native picker fallback. Electron may provide the
/// same capability through its bridge, but Files sharing never depends on Electron.
async fn choose_path(
    Query(query): Query<ChoosePathQuery>,
) -> Result<Json<serde_json::Value>, LocalError> {
    let selected: Option<PathBuf> = match query.directory {
        Some(true) => rfd::AsyncFileDialog::new()
            .pick_folder()
            .await
            .map(|handle| handle.path().to_owned()),
        Some(false) => rfd::AsyncFileDialog::new()
            .pick_file()
            .await
            .map(|handle| handle.path().to_owned()),
        None => pick_file_or_directory().await?,
    };
    Ok(Json(serde_json::json!({
        "path": selected.map(|path| path.to_string_lossy().into_owned())
    })))
}

/// Files has one product operation, regardless of whether the selected source is a file or a
/// directory. rfd exposes those as two separate calls, so macOS uses NSOpenPanel directly with
/// both capabilities enabled. Other platforms keep the same Local API contract while their
/// unified picker adapter is completed; Electron supplies the combined native intent today.
#[cfg(target_os = "macos")]
async fn pick_file_or_directory() -> Result<Option<PathBuf>, LocalError> {
    let path = tokio::task::spawn_blocking(|| {
        let script = r#"ObjC.import('AppKit');
const panel = $.NSOpenPanel.openPanel;
panel.canChooseFiles = true;
panel.canChooseDirectories = true;
panel.allowsMultipleSelection = false;
panel.canCreateDirectories = false;
if (panel.runModal === $.NSModalResponseOK) {
  console.log(ObjC.unwrap(panel.URL.path));
}"#;
        Command::new("/usr/bin/osascript")
            .args(["-l", "JavaScript", "-e", script])
            .output()
    })
    .await
    .map_err(LocalError::internal)?
    .map_err(LocalError::internal)?;
    if !path.status.success() {
        return Err(LocalError::internal(anyhow::anyhow!(
            "Unified file picker failed: {}",
            String::from_utf8_lossy(&path.stderr).trim()
        )));
    }
    let path = String::from_utf8_lossy(&path.stdout).trim().to_owned();
    if path.is_empty() {
        Ok(None)
    } else {
        Ok(Some(PathBuf::from(path)))
    }
}

#[cfg(not(target_os = "macos"))]
async fn pick_file_or_directory() -> Result<Option<PathBuf>, LocalError> {
    // Browser-hosted GUI on non-macOS will move to the same combined platform adapter. Keep a
    // single endpoint and never re-expose the source kind as a second product decision.
    Ok(rfd::AsyncFileDialog::new()
        .pick_file()
        .await
        .map(|handle| handle.path().to_owned()))
}
async fn current_user_id(state: &AppState) -> Result<String, LocalError> {
    state
        .inner
        .session
        .lock()
        .await
        .as_ref()
        .map(|session| session.user.id.clone())
        .ok_or_else(|| LocalError::unauthorized("Sign in first"))
}
async fn set_current_organization(state: &AppState, id: &str) -> Result<(), LocalError> {
    let key = format!("current_organization:{}", current_user_id(state).await?);
    let store = state.inner.store.lock().await;
    store.execute("insert into local_settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value",[&key,id]).map_err(LocalError::internal)?;
    Ok(())
}
async fn current_organization_id(state: &AppState) -> Result<String, LocalError> {
    let organizations = collaboration::list_organizations(State(state.clone()))
        .await?
        .0;
    organizations
        .into_iter()
        .find(|organization| organization.active)
        .map(|organization| organization.id)
        .ok_or_else(|| LocalError::bad_request("Create an Organization first"))
}

async fn proxy_one<T: Serialize, R: for<'de> Deserialize<'de>>(
    request: colab_observability::RequestBuilder,
    state: &AppState,
    body: &T,
) -> Result<Json<R>, LocalError> {
    let token = access_token(state).await?;
    let response = request
        .bearer_auth(token)
        .json(body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}
async fn proxy_empty<T: Serialize>(
    request: colab_observability::RequestBuilder,
    state: &AppState,
    body: &T,
) -> Result<StatusCode, LocalError> {
    let token = access_token(state).await?;
    let response = request
        .bearer_auth(token)
        .json(body)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(StatusCode::NO_CONTENT)
}
async fn proxy_delete(
    request: colab_observability::RequestBuilder,
    state: &AppState,
) -> Result<StatusCode, LocalError> {
    let token = access_token(state).await?;
    let response = request
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(StatusCode::NO_CONTENT)
}
async fn access_token(state: &AppState) -> Result<String, LocalError> {
    let _refresh_guard = state.inner.auth_refresh_lock.lock().await;
    let current = state
        .inner
        .session
        .lock()
        .await
        .clone()
        .ok_or_else(|| LocalError {
            status: StatusCode::UNAUTHORIZED,
            message: "Sign in first".to_owned(),
        })?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(LocalError::internal)?
        .as_secs() as i64;
    if current.expires_at > now + 60 {
        return Ok(current.access_token);
    }
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/auth/session/refresh",
            state.inner.server_url
        ))
        .json(&serde_json::json!({"refreshToken": current.refresh_token}))
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            *state.inner.session.lock().await = None;
        }
        return Err(remote_error(response).await);
    }
    let rotated: ColabSession = response.json().await.map_err(LocalError::internal)?;
    // Persist before publishing in memory: after a crash the old token is already consumed, while
    // the newly stored pair remains recoverable when Local Core restarts.
    auth::save_account(state, &rotated).await?;
    let token = rotated.access_token.clone();
    *state.inner.session.lock().await = Some(rotated);
    Ok(token)
}

/// Resolve credentials for a registered runtime owner, independently of the account currently
/// shown by the GUI. Switching the foreground account must not stop another saved account's
/// device runtime from servicing durable Agent requests.
async fn access_token_for_user(state: &AppState, user_id: &str) -> Result<String, LocalError> {
    let _refresh_guard = state.inner.auth_refresh_lock.lock().await;
    let current: ColabSession = {
        let store = state.inner.store.lock().await;
        let encoded: String = store
            .query_row(
                "select session_json from accounts where user_id=?1",
                [user_id],
                |row| row.get(0),
            )
            .map_err(|_| LocalError::unauthorized("Runtime owner must sign in again"))?;
        serde_json::from_str(&encoded).map_err(LocalError::internal)?
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(LocalError::internal)?
        .as_secs() as i64;
    if current.expires_at > now + 60 {
        return Ok(current.access_token);
    }
    let response = state
        .inner
        .http
        .post(format!(
            "{}/v1/auth/session/refresh",
            state.inner.server_url
        ))
        .json(&serde_json::json!({"refreshToken": current.refresh_token}))
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let rotated: ColabSession = response.json().await.map_err(LocalError::internal)?;
    let encoded = serde_json::to_string(&rotated).map_err(LocalError::internal)?;
    {
        let store = state.inner.store.lock().await;
        store
            .execute(
                "update accounts set session_json=?1,last_used_at=current_timestamp where user_id=?2",
                rusqlite::params![encoded, user_id],
            )
            .map_err(LocalError::internal)?;
    }
    if state
        .inner
        .session
        .lock()
        .await
        .as_ref()
        .is_some_and(|session| session.user.id == user_id)
    {
        *state.inner.session.lock().await = Some(rotated.clone());
    }
    Ok(rotated.access_token)
}
async fn proxy_json(response: reqwest::Response) -> Result<Json<Vec<Channel>>, LocalError> {
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    Ok(Json(response.json().await.map_err(LocalError::internal)?))
}
async fn remote_error(response: reqwest::Response) -> LocalError {
    let status =
        StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let message = response
        .text()
        .await
        .unwrap_or_else(|_| "Colab Server request failed".to_owned());
    LocalError { status, message }
}
#[derive(Debug)]
struct LocalError {
    status: StatusCode,
    message: String,
}
impl LocalError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }
    fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: message.into(),
        }
    }
    fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: message.into(),
        }
    }
    fn internal(error: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: error.to_string(),
        }
    }
}
impl IntoResponse for LocalError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(serde_json::json!({ "error": self.message })),
        )
            .into_response()
    }
}
