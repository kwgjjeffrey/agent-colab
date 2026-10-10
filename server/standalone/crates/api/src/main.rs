use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

use anyhow::Context;
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use colab_server_persistence::Database;
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tower_http::{
    catch_panic::CatchPanicLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
};

mod blobs;
mod session_upload;
mod session_indexes;
#[cfg(test)]
mod session_protocol_tests;
mod assets;
mod feedback;
mod canvas;
mod canvas_images;
mod catalog;
mod observability;
mod email_outbox;
mod messaging;
mod account_profile;
mod context_prompt;
mod transfers;
mod device_auth;
mod external_auth;
mod directory;
mod activity;
mod blob_store;
mod invite_links;

#[derive(Clone)]
struct AppState {
    database: Database,
    http: reqwest::Client,
    google_client_id: String,
    external_auth: Option<external_auth::Config>,
    blob_root: PathBuf,
    blob_store: blob_store::BlobStore,
    canvas_image_store: blob_store::BlobStore,
    message_events: tokio::sync::broadcast::Sender<messaging::MessageInvalidation>,
    agent_status_events: tokio::sync::broadcast::Sender<messaging::AgentRequestInvalidation>,
    canvas_events: tokio::sync::broadcast::Sender<canvas::CanvasInvalidation>,
    agent_request_events: tokio::sync::broadcast::Sender<uuid::Uuid>,
    // A runtime can reconnect before an older socket has fully torn down. Count live sockets so
    // one stale connection cannot incorrectly mark the device offline for the newer connection.
    runtime_presence: Arc<tokio::sync::RwLock<std::collections::HashMap<uuid::Uuid, usize>>>,
}

struct Config {
    address: SocketAddr,
    database_url: String,
    database_max_connections: u32,
    google_oauth_credentials_file: String,
    smtp_url: Option<String>,
    cloudflare_email_account_id: Option<String>,
    cloudflare_email_api_token: Option<String>,
    email_from: String,
    public_url: String,
    blob_root: PathBuf,
}

impl Config {
    fn from_env() -> anyhow::Result<Self> {
        let address = std::env::var("COLAB_SERVER_ADDRESS")
            .unwrap_or_else(|_| "127.0.0.1:8787".to_owned())
            .parse()
            .context("parse COLAB_SERVER_ADDRESS")?;
        let database_url =
            std::env::var("COLAB_DATABASE_URL").context("COLAB_DATABASE_URL is required")?;
        let database_max_connections = std::env::var("COLAB_DATABASE_MAX_CONNECTIONS")
            .unwrap_or_else(|_| "10".to_owned())
            .parse()
            .context("parse COLAB_DATABASE_MAX_CONNECTIONS")?;
        let google_oauth_credentials_file = std::env::var("COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE")
            .context("COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE is required")?;
        let smtp_url = std::env::var("COLAB_SMTP_URL").ok();
        let cloudflare_email_account_id = std::env::var("COLAB_CLOUDFLARE_EMAIL_ACCOUNT_ID").ok();
        let cloudflare_email_api_token = std::env::var("COLAB_CLOUDFLARE_EMAIL_API_TOKEN").ok();
        let email_from = std::env::var("COLAB_EMAIL_FROM")
            .unwrap_or_else(|_| "Colab <invite@agent-colab.zhiyuanwangluo.online>".to_owned());
        let public_url = std::env::var("COLAB_PUBLIC_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8787".to_owned());
        let blob_root = std::env::var("COLAB_BLOB_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(".data/blobs"));

        Ok(Self {
            address,
            database_url,
            database_max_connections,
            google_oauth_credentials_file,
            smtp_url,
            cloudflare_email_account_id,
            cloudflare_email_api_token,
            email_from,
            public_url,
            blob_root,
        })
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.main", async {

    let _ = dotenvy::from_filename(".env.local");
    let _telemetry = colab_observability::init("colab-server", option_env!("COLAB_SERVER_VERSION").unwrap_or("development"));
    let config = Config::from_env()?;
    let blob_store = blob_store::BlobStore::from_env(config.blob_root.clone())?;
    let canvas_image_store = blob_store::BlobStore::canvas_images_from_env(config.blob_root.join("canvas-images"))?;
    let external_auth = external_auth::Config::load()?;
    let google =
        colab_server_auth::GoogleDesktopCredentials::load(&config.google_oauth_credentials_file)?;
    println!("google OAuth client loaded: {}", google.client_id);
    let database = Database::connect(&config.database_url, config.database_max_connections).await?
        .with_external_policy(external_auth.as_ref().and_then(|c| c.policy.clone()));
    if let Ok(ids)=std::env::var("COLAB_FEEDBACK_REVIEWER_IDS") {
        let reviewers=ids.split(',').filter(|s|!s.trim().is_empty()).map(|s|uuid::Uuid::parse_str(s.trim())).collect::<Result<Vec<_>,_>>().context("parse COLAB_FEEDBACK_REVIEWER_IDS")?;
        database.configure_builtin_feedback_reviewers(&reviewers).await.context("configure builtin feedback reviewers")?;
    }
    tokio::fs::create_dir_all(&config.blob_root)
        .await
        .context("create blob root")?;
    let email: Option<Arc<dyn colab_server_email::EmailSender>> = match (
        config.cloudflare_email_account_id,
        config.cloudflare_email_api_token,
        config.smtp_url,
    ) {
        (Some(account_id), Some(api_token), _) => {
            Some(Arc::new(colab_server_email::CloudflareEmailSender::new(
                account_id,
                api_token,
                config.email_from,
            )))
        }
        (None, None, Some(url)) => Some(Arc::new(colab_server_email::SmtpEmailSender::from_url(
            &url,
            config.email_from,
        )?)),
        (None, None, None) => None,
        _ => anyhow::bail!(
            "both COLAB_CLOUDFLARE_EMAIL_ACCOUNT_ID and COLAB_CLOUDFLARE_EMAIL_API_TOKEN are required"
        ),
    };
    let listener = TcpListener::bind(config.address)
        .await
        .with_context(|| format!("bind Colab server to {}", config.address))?;
    println!("colab-server listening on http://{}", config.address);
    transfers::spawn_expired_transfer_gc(database.clone(), blob_store.clone());
    blobs::spawn_orphan_gc(database.clone(), blob_store.clone());
    blobs::spawn_orphan_gc(database.clone(), canvas_image_store.clone());
    if let Some(sender) = email.clone() {
        email_outbox::spawn(database.clone(), sender, config.public_url.clone());
    }
    let (message_events, _) = tokio::sync::broadcast::channel(1024);
    let (agent_status_events, _) = tokio::sync::broadcast::channel(1024);
    let (agent_request_events, _) = tokio::sync::broadcast::channel(1024);
    let (canvas_events, _) = tokio::sync::broadcast::channel(1024);
    axum::serve(
        listener,
        router(AppState {
            database,
            http: reqwest::Client::new(),
            google_client_id: google.client_id,
            external_auth,
            blob_root: config.blob_root,
            blob_store,
            canvas_image_store,
            message_events,
            agent_status_events,
            agent_request_events,
            canvas_events,
            runtime_presence: Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
        })
        .into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .context("serve Colab API")

}).await
}

fn router(state: AppState) -> Router {
    let standard = Router::new()
        .route("/health/live", get(live))
        .route("/v1/observability/clock", get(colab_observability::clock_reply))
        .route("/v1/observability/traces", axum::routing::post(observability::traces).layer(axum::extract::DefaultBodyLimit::max(1024*1024)))
        .route("/health/ready", get(ready))
        .route("/v1/status", get(status))
        .route("/v1/auth/external/config", get(external_auth::config))
        .route("/v1/auth/external/session", post(external_auth::session).layer(DefaultBodyLimit::max(8192)))
        .route("/v1/auth/google/session", post(create_google_session))
        .route("/v1/auth/profile", get(account_profile::get).patch(account_profile::update))
        .route("/v1/auth/device/challenge", post(device_auth::challenge))
        .route("/v1/auth/device/accounts", post(device_auth::discover))
        .route("/v1/auth/device/session", post(device_auth::login))
        .route("/v1/auth/device/bind", post(device_auth::bind))
        .route("/v1/auth/devices", get(device_auth::devices))
        .route("/v1/auth/devices/{device_id}", delete(device_auth::unbind))
        .route("/v1/channels/{channel_id}/invite-links", post(invite_links::create))
        .route("/v1/invite-links/{id}", delete(invite_links::revoke))
        .route("/v1/invite-links/accept", post(invite_links::accept))
        .route("/invite/{token}", get(invite_links::landing))
        .route("/v1/auth/session/refresh", post(refresh_session))
        .route("/v1/auth/logout", post(logout))
        .route(
            "/v1/organizations",
            get(list_organizations).post(create_organization),
        )
        .route(
            "/v1/organizations/{organization_id}/channels",
            get(list_channels).post(create_channel),
        )
        .route("/v1/channels/{channel_id}", patch(update_channel))
        .route("/v1/channels/{channel_id}/activity", get(activity::list))
        .route("/v1/shares/{share_id}/read-activity", post(activity::record_read))
        .route(
            "/v1/channels/{channel_id}/members",
            get(list_members).post(add_member),
        )
        .route(
            "/v1/channels/{channel_id}/organization/people",
            get(search_people),
        )
        .route(
            "/v1/channels/{channel_id}/members/{member_id}",
            patch(update_member).delete(remove_member),
        )
        .route(
            "/v1/channels/{channel_id}/invitations/{email}",
            delete(remove_invitation),
        )
        .route(
            "/v1/organization-invitations/{token}/accept",
            post(accept_invitation),
        )
        .route(
            "/v1/channels/{channel_id}/files",
            get(list_file_shares).post(create_file_share),
        )
        .route(
            "/v1/files/{share_id}/revisions",
            get(list_file_revisions).post(upload_file_revision),
        )
        .route("/v1/files/{share_id}", delete(withdraw_file_share))
        .route(
            "/v1/file-revisions/{revision_id}/content",
            get(download_file_revision),
        )
        .route(
            "/v1/channels/{channel_id}/skills",
            get(list_skill_shares).post(create_skill_share),
        )
        .route(
            "/v1/skills/{share_id}/revisions",
            get(list_skill_revisions).post(upload_skill_revision),
        )
        .route("/v1/skills/{share_id}", delete(withdraw_skill_share))
        .route(
            "/v1/skill-revisions/{revision_id}/content",
            get(download_skill_revision),
        )
        .route(
            "/v1/channels/{channel_id}/sessions",
            get(list_session_shares).post(create_session_share),
        )
        .route(
            "/v1/sessions/{share_id}/segments",
            get(list_session_segments),
        )
        .route("/v1/sessions/{share_id}", delete(withdraw_session_share))
        .route("/v1/feedbacks/list-assets",post(feedback::list_assets).layer(DefaultBodyLimit::max(128*1024)))
        .route("/v1/feedbacks/list-feedbacks",post(feedback::list_feedbacks).layer(DefaultBodyLimit::max(128*1024)))
        .route("/v1/feedbacks/update-status",post(feedback::update_status).layer(DefaultBodyLimit::max(128*1024)))
        .route("/v1/feedbacks/{id}",axum::routing::put(feedback::submit).layer(DefaultBodyLimit::max(128*1024)))
        .route("/v1/feedbacks/{id}/comment",axum::routing::put(feedback::comment).layer(DefaultBodyLimit::max(128*1024)))
        .route("/v1/feedbacks/{id}/session",get(feedback::download).put(feedback::upload))
        .route("/v1/channels/{channel_id}/assets",post(assets::register))
        .route("/v1/shares/{share_id}/asset",get(assets::binding))
        .route(
            "/v1/session-segments/{segment_id}/content",
            get(download_session_segment),
        )
        .route("/invitations/{token}", get(invitation_landing))
        // Ordinary metadata calls must fail fast. Streaming transfer upload/download routes are
        // merged outside this layer and own bounded byte limits instead of a wall-clock timeout.
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ));
    standard
        // Upload owns a per-chunk idle timeout, not the metadata request deadline.
        .merge(Router::new().route("/v1/sessions/{share_id}/segments", post(upload_session_segment)))
        .merge(Router::new().route("/v1/sessions/{share_id}/read-index", post(session_indexes::upload)))
        .merge(Router::new().route("/v1/session-read-indexes/{index_id}/content", get(session_indexes::download)))
        .merge(messaging::routes())
        .merge(canvas::routes())
        .merge(canvas_images::router())
        .merge(catalog::routes())
        .merge(transfers::router())
        .with_state(state)
        .layer(axum::middleware::from_fn(colab_observability::http_span))
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(DefaultBodyLimit::max(256 * 1024 * 1024))
        .layer(CatchPanicLayer::new())
}

async fn live() -> &'static str {
    "ok"
}

async fn ready(State(state): State<AppState>) -> Result<&'static str, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.ready", async {

    if state.database.is_ready().await {
        Ok("ok")
    } else {
        Err(ApiError::unavailable("database_unavailable"))
    }

}).await
}

async fn status() -> Json<colab_server_domain::ServiceStatus> {
    Json(colab_server_domain::status())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleSessionRequest {
    id_token: String,
    nonce: String,
}

async fn create_google_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<GoogleSessionRequest>,
) -> Result<Json<colab_server_persistence::CreatedSession>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.create-google-session", async {

    if state.external_auth.as_ref().is_some_and(|c| c.policy.is_some()) { return Err(ApiError::forbidden("external_login_required")); }
    let identity = colab_server_auth::verify_google_id_token(
        &state.http,
        &request.id_token,
        &state.google_client_id,
        &request.nonce,
    )
    .await
    .map_err(|error| {
        eprintln!("Google identity rejected: {error:#}");
        ApiError::unauthorized("invalid_google_identity")
    })?;
    let link_user_id = if headers.contains_key("authorization") {
        Some(authenticated_user(&state, &headers).await?)
    } else { None };
    let session = state
        .database
        .create_google_session(
            &identity.sub,
            &identity.email,
            identity.name.as_deref(),
            identity.picture.as_deref(),
            link_user_id,
        )
        .await
        .map_err(|error| {
            eprintln!("create session failed: {error:#}");
            ApiError::internal("session_creation_failed")
        })?;
    Ok(Json(session))

}).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RefreshSessionRequest {
    refresh_token: String,
}

async fn refresh_session(
    State(state): State<AppState>,
    Json(request): Json<RefreshSessionRequest>,
) -> Result<Json<colab_server_persistence::CreatedSession>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.refresh-session", async {

    use colab_server_persistence::RefreshSessionError;
    match state.database.refresh_session(&request.refresh_token).await {
        Ok(session) => Ok(Json(session)),
        Err(RefreshSessionError::Invalid) => Err(ApiError::unauthorized("invalid_refresh_token")),
        Err(RefreshSessionError::Replay) => Err(ApiError::unauthorized("refresh_token_replayed")),
        Err(RefreshSessionError::Internal(error)) => {
            eprintln!("refresh session failed: {error:#}");
            Err(ApiError::internal("session_refresh_failed"))
        }
    }

}).await
}
async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.logout", async {

    let token = bearer_token(&headers)?;
    state
        .database
        .revoke_session(token)
        .await
        .map_err(|_| ApiError::internal("logout_failed"))?;
    Ok(StatusCode::NO_CONTENT)

}).await
}

#[derive(Deserialize)]
struct CreateChannelRequest {
    name: String,
    icon: Option<String>,
}
#[derive(Deserialize)]
struct CreateOrganizationRequest {
    name: String,
}
#[derive(Deserialize)]
struct UpdateChannelRequest {
    name: String,
    icon: Option<String>,
}
#[derive(Deserialize)]
struct AddMemberRequest {
    email: Option<String>,
    identity: Option<directory::Identity>,
    role: String,
}
#[derive(Deserialize)]
struct UpdateRoleRequest {
    role: String,
}
#[derive(Deserialize)]
struct SearchPeopleQuery {
    q: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AddMemberResponse {
    status: &'static str,
    email_delivery: &'static str,
}
#[derive(Deserialize)]
struct CreateFileShareRequest {
    name: String,
}
#[derive(Deserialize)]
struct CreateSkillShareRequest {
    name: String,
    description: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadRevisionQuery {
    root_oid: String,
    parent_root_oid: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionShareRequest {
    name: String,
    source_adapter: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadSessionSegmentQuery {
    parent_snapshot_id: Option<uuid::Uuid>,
    source_cursor: String,
    digest: String,
    #[serde(default)]
    reset_chain: bool,
    #[serde(default = "identity_codec")]
    codec: String,
    decoded_byte_size: Option<u64>,
    decoded_digest: Option<String>,
}
fn identity_codec() -> String { "identity".into() }

#[derive(Deserialize)]
struct SegmentDownloadQuery { #[serde(default)] encoded: bool }

async fn list_channels(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::Channel>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-channels", async {

    let user_id = authenticated_user(&state, &headers).await?;
    let channels = state
        .database
        .list_channels(user_id, organization_id)
        .await
        .map_err(|error| {
            eprintln!("list channels failed: {error:#}");
            ApiError::internal("channel_list_failed")
        })?;
    channels
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("organization_access_forbidden"))

}).await
}

async fn list_organizations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<colab_server_persistence::Organization>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-organizations", async {

    let user = authenticated_user(&state, &headers).await?;
    Ok(Json(
        state
            .database
            .list_organizations(user)
            .await
            .map_err(|_| ApiError::internal("organization_list_failed"))?,
    ))

}).await
}

async fn create_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateOrganizationRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::Organization>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.create-organization", async {

    let user = authenticated_user(&state, &headers).await?;
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(ApiError::bad_request("invalid_organization_name"));
    }
    let organization = state
        .database
        .create_organization(user, name)
        .await
        .map_err(|_| ApiError::internal("organization_creation_failed"))?;
    Ok((StatusCode::CREATED, Json(organization)))

}).await
}

async fn create_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<uuid::Uuid>,
    Json(request): Json<CreateChannelRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::Channel>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.create-channel", async {

    let user_id = authenticated_user(&state, &headers).await?;
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(ApiError::bad_request("invalid_channel_name"));
    }
    let channel = state
        .database
        .create_channel(user_id, organization_id, name, request.icon.as_deref())
        .await
        .map_err(|error| {
            eprintln!("create channel failed: {error:#}");
            ApiError::internal("channel_creation_failed")
        })?;
    Ok((StatusCode::CREATED, Json(channel)))

}).await
}

async fn update_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<UpdateChannelRequest>,
) -> Result<Json<colab_server_persistence::Channel>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.update-channel", async {

    let user_id = authenticated_user(&state, &headers).await?;
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(ApiError::bad_request("invalid_channel_name"));
    }
    state
        .database
        .update_channel(user_id, channel_id, name, request.icon.as_deref())
        .await
        .map_err(|_| ApiError::internal("channel_update_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_update_forbidden"))

}).await
}
async fn list_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::ChannelMember>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-members", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_members(user, channel_id)
        .await
        .map_err(|_| ApiError::internal("member_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}
async fn add_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<AddMemberRequest>,
) -> Result<(StatusCode, Json<AddMemberResponse>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.add-member", async {

    let user = authenticated_user(&state, &headers).await?;
    if !matches!(request.role.as_str(), "admin" | "member") {
        return Err(ApiError::bad_request("invalid_member"));
    }
    if state.database.profile_managed() {
        return directory::add(&state,user,channel_id,&request).await;
    }
    if request.identity.is_some() { return Err(ApiError::bad_request("unsupported_person_identity")); }
    let email=request.email.as_deref().filter(|s|s.contains('@')).ok_or_else(||ApiError::bad_request("invalid_member"))?;
    match state
        .database
        .add_member(user, channel_id, email, &request.role)
        .await
        .map_err(|error| {
            eprintln!("add member failed: {error:#}");
            ApiError::internal("member_add_failed")
        })? {
        colab_server_persistence::AddChannelMember::Joined => Ok((
            StatusCode::OK,
            Json(AddMemberResponse {
                status: "joined",
                email_delivery: "not_required",
            }),
        )),
        colab_server_persistence::AddChannelMember::Forbidden => {
            Err(ApiError::forbidden("member_add_forbidden"))
        }
        colab_server_persistence::AddChannelMember::Invitation { .. } => Ok((
            StatusCode::ACCEPTED,
            Json(AddMemberResponse {
                status: "invited",
                email_delivery: "queued",
            }),
        )),
    }

}).await
}
async fn search_people(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    axum::extract::Query(query): axum::extract::Query<SearchPeopleQuery>,
) -> Result<Json<Vec<directory::Person>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.search-people", async {

    let user = authenticated_user(&state, &headers).await?;
    if state.database.profile_managed() {
        return directory::search(&state,user,channel_id,query.q.as_deref().unwrap_or("")).await.map(Json);
    }
    state
        .database
        .search_organization_people(user, channel_id, query.q.as_deref().unwrap_or(""))
        .await
        .map_err(|_| ApiError::internal("people_search_failed"))?
        .map(|rows|Json(rows.into_iter().map(directory::Person::from).collect()))
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}
async fn accept_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.accept-invitation", async {

    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .accept_organization_invitation(user, &token)
        .await
        .map_err(|_| ApiError::internal("invitation_accept_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::bad_request("invalid_invitation"))
    }

}).await
}
async fn invitation_landing(Path(token): Path<String>) -> Result<Html<String>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.invitation-landing", async {

    if token.len() < 32
        || !token
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return Err(ApiError::bad_request("invalid_invitation"));
    }
    let deep_link = format!("agent-colab://invitation?token={token}");
    Ok(Html(format!(
        r#"<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Join on Colab</title><style>body{{font-family:system-ui;margin:0;background:#f4f3ed;color:#17211e}}main{{max-width:560px;margin:12vh auto;padding:40px}}a{{display:inline-block;margin-top:16px;padding:12px 18px;border-radius:10px;background:#17211e;color:white;text-decoration:none;font-weight:650}}p{{color:#66716d}}</style></head><body><main><h1>You have been invited to collaborate</h1><p>Open Colab to review and accept this Organization and Channel invitation. If needed, Colab will ask you to sign in with the invited Google account first.</p><a href="{deep_link}">Open Colab</a></main></body></html>"#
    )))

}).await
}
async fn list_file_shares(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::FileShare>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-file-shares", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_file_shares(user, channel_id)
        .await
        .map_err(|_| ApiError::internal("file_share_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}
async fn create_file_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<CreateFileShareRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::FileShare>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.create-file-share", async {

    let user = authenticated_user(&state, &headers).await?;
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(ApiError::bad_request("invalid_file_share_name"));
    }
    let share = state
        .database
        .create_file_share(user, channel_id, name)
        .await
        .map_err(|error| {
            if colab_server_persistence::is_unique_violation(&error) {
                ApiError::name_conflict("shared_item_name_conflict")
            } else {
                ApiError::internal("file_share_creation_failed")
            }
        })?
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))?;
    Ok((StatusCode::CREATED, Json(share)))

}).await
}
async fn upload_file_revision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
    Query(query): Query<UploadRevisionQuery>,
    body: Body,
) -> Result<(StatusCode, Json<colab_server_persistence::FileRevision>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.upload-file-revision", async {

    // The HTTP body is an opaque Git pack. The server does not interpret the file tree: it owns
    // authorization, durable blob storage and the atomic revision pointer only. This keeps the
    // service independent from local filesystem semantics and lets consumers use standard Git
    // object validation when materializing a revision.
    let user = authenticated_user(&state, &headers).await?;
    if !valid_oid(&query.root_oid)
        || query
            .parent_root_oid
            .as_deref()
            .is_some_and(|oid| !valid_oid(oid))
    {
        return Err(ApiError::bad_request("invalid_git_oid"));
    }
    let blob_key = uuid::Uuid::new_v4().simple().to_string();
    let byte_size = blobs::write_bounded(&state.blob_root, &blob_key, body).await?;
    state.blob_store.publish_staged(&blob_key).await?;
    // `create_file_revision` checks parent_root_oid and advances current_root_oid in one database
    // transaction. The blob is written first, then removed if CAS fails. Accepted but later
    // withdrawn/replaced blobs require the planned garbage-collection job.
    let revision = match state
        .database
        .create_file_revision(
            user,
            share_id,
            &query.root_oid,
            query.parent_root_oid.as_deref(),
            &blob_key,
            byte_size as i64,
        )
        .await
    {
        Ok(value) => value,
        Err(error) => {
            let _ = state.blob_store.delete(&blob_key).await;
            return Err(if error.to_string().contains("storage quota exceeded") {
                ApiError::payload_too_large("storage_quota_exceeded")
            } else {
                ApiError::internal("file_revision_creation_failed")
            });
        }
    };
    match revision {
        Some(value) => Ok((StatusCode::CREATED, Json(value))),
        None => {
            let _ = state.blob_store.delete(&blob_key).await;
            Err(ApiError::conflict("file_revision_conflict"))
        }
    }

}).await
}
async fn list_file_revisions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::FileRevision>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-file-revisions", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_file_revisions(user, share_id)
        .await
        .map_err(|_| ApiError::internal("file_revision_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("file_share_access_forbidden"))

}).await
}
async fn download_file_revision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(revision_id): Path<uuid::Uuid>,
) -> Result<Response, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.download-file-revision", async {

    let user = authenticated_user(&state, &headers).await?;
    let key = state
        .database
        .file_revision_blob_key(user, revision_id)
        .await
        .map_err(|_| ApiError::internal("file_revision_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("file_share_access_forbidden"))?;
    state.blob_store.response(&key, "application/x-git-packed-objects").await

}).await
}
async fn withdraw_file_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.withdraw-file-share", async {

    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .withdraw_file_share(user, share_id)
        .await
        .map_err(|_| ApiError::internal("file_share_withdraw_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("file_share_withdraw_forbidden"))
    }

}).await
}

async fn list_skill_shares(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::SkillShare>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-skill-shares", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_skill_shares(user, channel_id)
        .await
        .map_err(|_| ApiError::internal("skill_share_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}

async fn create_skill_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<CreateSkillShareRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::SkillShare>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.create-skill-share", async {

    let user = authenticated_user(&state, &headers).await?;
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(ApiError::bad_request("invalid_skill_share_name"));
    }
    let description = request
        .description
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if description.is_some_and(|value| value.chars().count() > 500) {
        return Err(ApiError::bad_request("invalid_skill_description"));
    }
    let share = state
        .database
        .create_skill_share(user, channel_id, name, description)
        .await
        .map_err(|error| {
            if colab_server_persistence::is_unique_violation(&error) {
                ApiError::name_conflict("shared_item_name_conflict")
            } else {
                ApiError::internal("skill_share_creation_failed")
            }
        })?
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))?;
    Ok((StatusCode::CREATED, Json(share)))

}).await
}

async fn upload_skill_revision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
    Query(query): Query<UploadRevisionQuery>,
    body: Body,
) -> Result<(StatusCode, Json<colab_server_persistence::FileRevision>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.upload-skill-revision", async {

    let user = authenticated_user(&state, &headers).await?;
    if !valid_oid(&query.root_oid)
        || query
            .parent_root_oid
            .as_deref()
            .is_some_and(|oid| !valid_oid(oid))
    {
        return Err(ApiError::bad_request("invalid_git_oid"));
    }
    // Skill packages deliberately use the same opaque Git-pack transport as Files. The Server
    // authorizes and persists bytes but never parses SKILL.md or invents another version model.
    let blob_key = uuid::Uuid::new_v4().simple().to_string();
    let byte_size = blobs::write_bounded(&state.blob_root, &blob_key, body).await?;
    state.blob_store.publish_staged(&blob_key).await?;
    let revision = match state
        .database
        .create_skill_revision(
            user,
            share_id,
            &query.root_oid,
            query.parent_root_oid.as_deref(),
            &blob_key,
            byte_size as i64,
        )
        .await
    {
        Ok(value) => value,
        Err(error) => {
            let _ = state.blob_store.delete(&blob_key).await;
            return Err(if error.to_string().contains("storage quota exceeded") {
                ApiError::payload_too_large("storage_quota_exceeded")
            } else {
                ApiError::internal("skill_revision_creation_failed")
            });
        }
    };
    match revision {
        Some(value) => Ok((StatusCode::CREATED, Json(value))),
        None => {
            let _ = state.blob_store.delete(&blob_key).await;
            Err(ApiError::conflict("skill_revision_conflict"))
        }
    }

}).await
}

async fn list_skill_revisions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::FileRevision>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-skill-revisions", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_skill_revisions(user, share_id)
        .await
        .map_err(|_| ApiError::internal("skill_revision_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("skill_share_access_forbidden"))

}).await
}

async fn download_skill_revision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(revision_id): Path<uuid::Uuid>,
) -> Result<Response, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.download-skill-revision", async {

    let user = authenticated_user(&state, &headers).await?;
    let key = state
        .database
        .skill_revision_blob_key(user, revision_id)
        .await
        .map_err(|_| ApiError::internal("skill_revision_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("skill_share_access_forbidden"))?;
    state.blob_store.response(&key, "application/x-git-packed-objects").await

}).await
}

async fn withdraw_skill_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.withdraw-skill-share", async {

    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .withdraw_skill_share(user, share_id)
        .await
        .map_err(|_| ApiError::internal("skill_share_withdraw_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("skill_share_withdraw_forbidden"))
    }

}).await
}

async fn list_session_shares(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::SessionShare>>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-session-shares", async {

    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_session_shares(user, channel_id)
        .await
        .map_err(|_| ApiError::internal("session_share_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))

}).await
}
async fn create_session_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<CreateSessionShareRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::SessionShare>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.create-session-share", async {

    let user = authenticated_user(&state, &headers).await?;
    let name = request.name.trim();
    if name.is_empty()
        || name.chars().count() > 120
        || !matches!(
            request.source_adapter.as_str(),
            "codex-jsonl-v1" | "myflicker-jsonl-v1" | "claude-jsonl-v1"
        )
    {
        return Err(ApiError::bad_request("invalid_session_share"));
    }
    let value = state
        .database
        .create_session_share(user, channel_id, name, &request.source_adapter)
        .await
        .map_err(|e| {
            if colab_server_persistence::is_unique_violation(&e) {
                ApiError::name_conflict("shared_item_name_conflict")
            } else {
                ApiError::internal("session_share_creation_failed")
            }
        })?
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))?;
    Ok((StatusCode::CREATED, Json(value)))

}).await
}
async fn upload_session_segment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
    Query(query): Query<UploadSessionSegmentQuery>,
    body: Body,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.upload-session-segment", async {

    let user = authenticated_user(&state, &headers).await?;
    if query.source_cursor.len() > 4096
        || query.digest.len() != 64
        || !query.digest.chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(ApiError::bad_request("invalid_session_segment"));
    }
    let key = uuid::Uuid::new_v4().simple().to_string();
    session_upload::validate_codec_metadata(&query.codec, query.decoded_byte_size, query.decoded_digest.as_deref())?;
    let size = if query.codec == "zstd" {
        session_upload::receive_zstd(&state.blob_root, &key, body, &query.digest).await?
    } else {
        session_upload::receive(&state.blob_root, &key, body, &query.digest).await?
    };
    if query.codec == "zstd" {
        let path = blobs::path(&state.blob_root, &key);
        let expected_size = query.decoded_byte_size.unwrap();
        let expected_digest = query.decoded_digest.clone().unwrap();
        let validated = tokio::task::spawn_blocking(move || session_upload::verify_zstd(&path, expected_size, &expected_digest)).await;
        if !matches!(validated, Ok(Ok(()))) {
            let _ = state.blob_store.delete(&key).await;
            return Err(ApiError::bad_request("session_decoded_chunk_mismatch"));
        }
    }
    state.blob_store.publish_staged(&key).await?;
    match state
        .database
        .append_session_segment(
            user,
            share_id,
            query.parent_snapshot_id,
            query.reset_chain,
            &query.source_cursor,
            &key,
            &query.digest,
            size as i64,
            &query.codec,
            query.decoded_byte_size.map(|size|size as i64),
            query.decoded_digest.as_deref(),
        )
        .await
        .map_err(|_| ApiError::internal("session_segment_creation_failed"))
    {
        Ok(Some((snapshot, segment))) => Ok((
            StatusCode::CREATED,
            Json(serde_json::json!({"snapshot":snapshot,"segment":segment})),
        )),
        Ok(None) => {
            let _ = state.blob_store.delete(&key).await;
            Err(ApiError::conflict("session_snapshot_conflict"))
        }
        Err(error) => { let _ = state.blob_store.delete(&key).await; Err(error) }
    }

}).await
}
async fn list_session_segments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
    Query(query): Query<SegmentDownloadQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.list-session-segments", async {

    let user = authenticated_user(&state, &headers).await?;
    let chain = state
        .database
        .session_snapshot_chain(user, share_id)
        .await
        .map_err(|_| ApiError::internal("session_snapshot_list_failed"))?
        .ok_or_else(|| ApiError::forbidden("session_share_access_forbidden"))?;
    let current = chain.last().map(|x| &x.0);
    let read_index=state.database.session_read_index(user,share_id).await.map_err(|_|ApiError::internal("session_read_index_lookup_failed"))?;
    let mut result=serde_json::json!({"snapshot":current,"chunkProtocol":2,"readIndex":read_index,"segments":chain.into_iter().map(|(_,s)|s).collect::<Vec<_>>() });
    if !query.encoded {
        // Legacy clients hash the bytes returned by the default raw content route.
        // New clients opt into encoded metadata and content together.
        for segment in result["segments"].as_array_mut().unwrap() {
            if segment["codec"]=="zstd" {segment["byteSize"]=segment["decodedByteSize"].clone();segment["digest"]=segment["decodedDigest"].clone();}
        }
    }
    Ok(Json(result))

}).await
}
async fn download_session_segment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(segment_id): Path<uuid::Uuid>,
    Query(query): Query<SegmentDownloadQuery>,
) -> Result<Response, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.download-session-segment", async {

    let user = authenticated_user(&state, &headers).await?;
    let (key, codec) = state
        .database
        .session_segment_storage(user, segment_id)
        .await
        .map_err(|_| ApiError::internal("session_segment_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("session_share_access_forbidden"))?;
    let response = state.blob_store.response(&key, if query.encoded {"application/octet-stream"} else {"application/x-ndjson"}).await?;
    if codec != "zstd" || query.encoded { return Ok(response); }
    // Old clients retain their raw-byte contract; new readers request encoded frames.
    // This is a streaming compatibility decoder, never a reconstructed Server file.
    use futures_util::TryStreamExt;
    let input = tokio_util::io::StreamReader::new(response.into_body().into_data_stream().map_err(std::io::Error::other));
    let decoded = async_compression::tokio::bufread::ZstdDecoder::new(tokio::io::BufReader::new(input));
    Ok(([(header::CONTENT_TYPE,"application/x-ndjson")], Body::from_stream(tokio_util::io::ReaderStream::new(decoded))).into_response())

}).await
}
async fn withdraw_session_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.withdraw-session-share", async {

    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .withdraw_session_share(user, share_id)
        .await
        .map_err(|_| ApiError::internal("session_share_withdraw_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("session_share_withdraw_forbidden"))
    }

}).await
}
fn valid_oid(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.chars().all(|c| c.is_ascii_hexdigit())
}
fn blob_path(root: &std::path::Path, key: &str) -> PathBuf {
    root.join(&key[..2]).join(key)
}
async fn update_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((channel_id, member_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(request): Json<UpdateRoleRequest>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.update-member", async {

    let user = authenticated_user(&state, &headers).await?;
    if !matches!(request.role.as_str(), "admin" | "member") {
        return Err(ApiError::bad_request("invalid_role"));
    }
    if state
        .database
        .update_member_role(user, channel_id, member_id, &request.role)
        .await
        .map_err(|_| ApiError::internal("member_update_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("member_update_forbidden"))
    }

}).await
}
async fn remove_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((channel_id, member_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.remove-member", async {

    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .remove_member(user, channel_id, Some(member_id), None)
        .await
        .map_err(|_| ApiError::internal("member_remove_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("member_remove_forbidden"))
    }

}).await
}
async fn remove_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((channel_id, email)): Path<(uuid::Uuid, String)>,
) -> Result<StatusCode, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.remove-invitation", async {

    let user = authenticated_user(&state, &headers).await?;
    if state
        .database
        .remove_member(user, channel_id, None, Some(&email))
        .await
        .map_err(|_| ApiError::internal("invitation_remove_failed"))?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::forbidden("invitation_remove_forbidden"))
    }

}).await
}

async fn authenticated_user(state: &AppState, headers: &HeaderMap) -> Result<uuid::Uuid, ApiError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "server.main.authenticated-user", async {

    let token = bearer_token(headers)?;
    let user_id = state
        .database
        .authenticate(token)
        .await
        .map_err(|error| {
            eprintln!("session lookup failed: {error:#}");
            ApiError::internal("session_lookup_failed")
        })?
        .ok_or_else(|| ApiError::unauthorized("invalid_session"))?;
    colab_observability::record_user_id(&user_id.to_string());
    Ok(user_id)

}).await
}
fn bearer_token(headers: &HeaderMap) -> Result<&str, ApiError> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(|| ApiError::unauthorized("missing_session"))
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: &'static str,
    retryable: bool,
}

impl ApiError {
    fn forbidden(code: &'static str) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            code,
            message: "This action is not allowed",
            retryable: false,
        }
    }
    fn bad_request(code: &'static str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code,
            message: "The request is invalid",
            retryable: false,
        }
    }
    fn payload_too_large(code: &'static str) -> Self {
        Self {
            status: StatusCode::PAYLOAD_TOO_LARGE,
            code,
            message: "The upload exceeds a storage limit",
            retryable: false,
        }
    }
    fn unauthorized(code: &'static str) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code,
            message: "Google authentication failed",
            retryable: false,
        }
    }
    fn conflict(code: &'static str) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code,
            message: "The shared files changed; sync and retry",
            retryable: true,
        }
    }

    fn name_conflict(code: &'static str) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code,
            message: "That name is already in use in this scope",
            retryable: false,
        }
    }

    fn internal(code: &'static str) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code,
            message: "The session could not be created",
            retryable: true,
        }
    }

    fn unavailable(code: &'static str) -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            code,
            message: "A required service is unavailable",
            retryable: true,
        }
    }

    fn too_many_requests(code: &'static str) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            code,
            message: "Too many temporary transfers were created from this address",
            retryable: true,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: &'static str,
    message: &'static str,
    retryable: bool,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorBody {
                code: self.code,
                message: self.message,
                retryable: self.retryable,
            }),
        )
            .into_response()
    }
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
