use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

use anyhow::Context;
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use colab_server_persistence::Database;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use tokio::net::TcpListener;
use tokio_util::io::ReaderStream;
use tower_http::{
    catch_panic::CatchPanicLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
};

#[derive(Clone)]
struct AppState {
    database: Database,
    http: reqwest::Client,
    google_client_id: String,
    email: Option<Arc<dyn colab_server_email::EmailSender>>,
    public_url: String,
    blob_root: PathBuf,
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
    let _ = dotenvy::from_filename(".env.local");
    let config = Config::from_env()?;
    let google =
        colab_server_auth::GoogleDesktopCredentials::load(&config.google_oauth_credentials_file)?;
    println!("google OAuth client loaded: {}", google.client_id);
    let database = Database::connect(&config.database_url, config.database_max_connections).await?;
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
    axum::serve(
        listener,
        router(AppState {
            database,
            http: reqwest::Client::new(),
            google_client_id: google.client_id,
            email,
            public_url: config.public_url,
            blob_root: config.blob_root,
        }),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .context("serve Colab API")
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/v1/status", get(status))
        .route("/v1/auth/google/session", post(create_google_session))
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
            get(list_session_segments).post(upload_session_segment),
        )
        .route("/v1/sessions/{share_id}", delete(withdraw_session_share))
        .route(
            "/v1/session-segments/{segment_id}/content",
            get(download_session_segment),
        )
        .route("/invitations/{token}", get(invitation_landing))
        .with_state(state)
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(DefaultBodyLimit::max(256 * 1024 * 1024))
        .layer(CatchPanicLayer::new())
}

async fn live() -> &'static str {
    "ok"
}

async fn ready(State(state): State<AppState>) -> Result<&'static str, ApiError> {
    if state.database.is_ready().await {
        Ok("ok")
    } else {
        Err(ApiError::unavailable("database_unavailable"))
    }
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
    Json(request): Json<GoogleSessionRequest>,
) -> Result<Json<colab_server_persistence::CreatedSession>, ApiError> {
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
    let session = state
        .database
        .create_google_session(
            &identity.sub,
            &identity.email,
            identity.name.as_deref(),
            identity.picture.as_deref(),
        )
        .await
        .map_err(|error| {
            eprintln!("create session failed: {error:#}");
            ApiError::internal("session_creation_failed")
        })?;
    Ok(Json(session))
}
async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Result<StatusCode, ApiError> {
    let token = bearer_token(&headers)?;
    state
        .database
        .revoke_session(token)
        .await
        .map_err(|_| ApiError::internal("logout_failed"))?;
    Ok(StatusCode::NO_CONTENT)
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
    email: String,
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
}

async fn list_channels(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::Channel>>, ApiError> {
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
}

async fn list_organizations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<colab_server_persistence::Organization>>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    Ok(Json(
        state
            .database
            .list_organizations(user)
            .await
            .map_err(|_| ApiError::internal("organization_list_failed"))?,
    ))
}

async fn create_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateOrganizationRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::Organization>), ApiError> {
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
}

async fn create_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<uuid::Uuid>,
    Json(request): Json<CreateChannelRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::Channel>), ApiError> {
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
}

async fn update_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<UpdateChannelRequest>,
) -> Result<Json<colab_server_persistence::Channel>, ApiError> {
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
}
async fn list_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::ChannelMember>>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_members(user, channel_id)
        .await
        .map_err(|_| ApiError::internal("member_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))
}
async fn add_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<AddMemberRequest>,
) -> Result<(StatusCode, Json<AddMemberResponse>), ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    if !matches!(request.role.as_str(), "admin" | "member") || !request.email.contains('@') {
        return Err(ApiError::bad_request("invalid_member"));
    }
    match state
        .database
        .add_member(user, channel_id, &request.email, &request.role)
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
        colab_server_persistence::AddChannelMember::Invitation {
            invitation_id: _,
            token,
            email,
            organization_name,
            inviter_name,
        } => {
            let Some(sender) = &state.email else {
                return Ok((
                    StatusCode::ACCEPTED,
                    Json(AddMemberResponse {
                        status: "invited",
                        email_delivery: "not_configured",
                    }),
                ));
            };
            let accept_url = format!(
                "{}/invitations/{}",
                state.public_url.trim_end_matches('/'),
                token
            );
            sender
                .send_organization_invite(colab_server_email::OrganizationInvite {
                    to: &email,
                    organization: &organization_name,
                    inviter: &inviter_name,
                    accept_url: &accept_url,
                })
                .await
                .map_err(|error| {
                    eprintln!("send invitation failed: {error:#}");
                    ApiError::unavailable("invitation_email_failed")
                })?;
            Ok((
                StatusCode::ACCEPTED,
                Json(AddMemberResponse {
                    status: "invited",
                    email_delivery: "sent",
                }),
            ))
        }
    }
}
async fn search_people(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    axum::extract::Query(query): axum::extract::Query<SearchPeopleQuery>,
) -> Result<Json<Vec<colab_server_persistence::OrganizationPerson>>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .search_organization_people(user, channel_id, query.q.as_deref().unwrap_or(""))
        .await
        .map_err(|_| ApiError::internal("people_search_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))
}
async fn accept_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> Result<StatusCode, ApiError> {
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
}
async fn invitation_landing(Path(token): Path<String>) -> Result<Html<String>, ApiError> {
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
}
async fn list_file_shares(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::FileShare>>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_file_shares(user, channel_id)
        .await
        .map_err(|_| ApiError::internal("file_share_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))
}
async fn create_file_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<CreateFileShareRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::FileShare>), ApiError> {
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
}
async fn upload_file_revision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
    Query(query): Query<UploadRevisionQuery>,
    body: Bytes,
) -> Result<(StatusCode, Json<colab_server_persistence::FileRevision>), ApiError> {
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
    let path = blob_path(&state.blob_root, &blob_key);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| ApiError::internal("blob_write_failed"))?;
    }
    let temporary = path.with_extension("uploading");
    tokio::fs::write(&temporary, &body)
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
    // `create_file_revision` checks parent_root_oid and advances current_root_oid in one database
    // transaction. The blob is written first, then removed if CAS fails. Accepted but later
    // withdrawn/replaced blobs require the planned garbage-collection job.
    let revision = state
        .database
        .create_file_revision(
            user,
            share_id,
            &query.root_oid,
            query.parent_root_oid.as_deref(),
            &blob_key,
            body.len() as i64,
        )
        .await
        .map_err(|_| ApiError::internal("file_revision_creation_failed"))?;
    match revision {
        Some(value) => Ok((StatusCode::CREATED, Json(value))),
        None => {
            let _ = tokio::fs::remove_file(path).await;
            Err(ApiError::conflict("file_revision_conflict"))
        }
    }
}
async fn list_file_revisions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::FileRevision>>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_file_revisions(user, share_id)
        .await
        .map_err(|_| ApiError::internal("file_revision_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("file_share_access_forbidden"))
}
async fn download_file_revision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(revision_id): Path<uuid::Uuid>,
) -> Result<Response, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    let key = state
        .database
        .file_revision_blob_key(user, revision_id)
        .await
        .map_err(|_| ApiError::internal("file_revision_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("file_share_access_forbidden"))?;
    let bytes = tokio::fs::read(blob_path(&state.blob_root, &key))
        .await
        .map_err(|_| ApiError::internal("blob_read_failed"))?;
    Ok((
        [(header::CONTENT_TYPE, "application/x-git-packed-objects")],
        bytes,
    )
        .into_response())
}
async fn withdraw_file_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
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
}

async fn list_skill_shares(State(state): State<AppState>, headers: HeaderMap, Path(channel_id): Path<uuid::Uuid>) -> Result<Json<Vec<colab_server_persistence::SkillShare>>, ApiError> {
    let user=authenticated_user(&state,&headers).await?;
    state.database.list_skill_shares(user,channel_id).await.map_err(|_|ApiError::internal("skill_share_list_failed"))?.map(Json).ok_or_else(||ApiError::forbidden("channel_access_forbidden"))
}

async fn create_skill_share(State(state): State<AppState>, headers: HeaderMap, Path(channel_id): Path<uuid::Uuid>, Json(request): Json<CreateSkillShareRequest>) -> Result<(StatusCode,Json<colab_server_persistence::SkillShare>),ApiError> {
    let user=authenticated_user(&state,&headers).await?;
    let name=request.name.trim();
    if name.is_empty() || name.chars().count()>120 { return Err(ApiError::bad_request("invalid_skill_share_name")) }
    let description=request.description.as_deref().map(str::trim).filter(|value|!value.is_empty());
    if description.is_some_and(|value|value.chars().count()>500) { return Err(ApiError::bad_request("invalid_skill_description")) }
    let share=state.database.create_skill_share(user,channel_id,name,description).await.map_err(|error| if colab_server_persistence::is_unique_violation(&error){ApiError::name_conflict("shared_item_name_conflict")}else{ApiError::internal("skill_share_creation_failed")})?.ok_or_else(||ApiError::forbidden("channel_access_forbidden"))?;
    Ok((StatusCode::CREATED,Json(share)))
}

async fn upload_skill_revision(State(state): State<AppState>, headers: HeaderMap, Path(share_id): Path<uuid::Uuid>, Query(query): Query<UploadRevisionQuery>, body: Bytes) -> Result<(StatusCode,Json<colab_server_persistence::FileRevision>),ApiError> {
    let user=authenticated_user(&state,&headers).await?;
    if !valid_oid(&query.root_oid) || query.parent_root_oid.as_deref().is_some_and(|oid|!valid_oid(oid)){return Err(ApiError::bad_request("invalid_git_oid"))}
    // Skill packages deliberately use the same opaque Git-pack transport as Files. The Server
    // authorizes and persists bytes but never parses SKILL.md or invents another version model.
    let blob_key=uuid::Uuid::new_v4().simple().to_string();
    let path=blob_path(&state.blob_root,&blob_key);
    if let Some(parent)=path.parent(){tokio::fs::create_dir_all(parent).await.map_err(|_|ApiError::internal("blob_write_failed"))?}
    let temporary=path.with_extension("uploading");
    tokio::fs::write(&temporary,&body).await.map_err(|_|ApiError::internal("blob_write_failed"))?;
    tokio::fs::rename(&temporary,&path).await.map_err(|_|ApiError::internal("blob_write_failed"))?;
    match state.database.create_skill_revision(user,share_id,&query.root_oid,query.parent_root_oid.as_deref(),&blob_key,body.len() as i64).await.map_err(|_|ApiError::internal("skill_revision_creation_failed"))? {
        Some(value)=>Ok((StatusCode::CREATED,Json(value))),
        None=>{let _=tokio::fs::remove_file(path).await;Err(ApiError::conflict("skill_revision_conflict"))}
    }
}

async fn list_skill_revisions(State(state): State<AppState>, headers: HeaderMap, Path(share_id): Path<uuid::Uuid>) -> Result<Json<Vec<colab_server_persistence::FileRevision>>,ApiError>{
    let user=authenticated_user(&state,&headers).await?;
    state.database.list_skill_revisions(user,share_id).await.map_err(|_|ApiError::internal("skill_revision_list_failed"))?.map(Json).ok_or_else(||ApiError::forbidden("skill_share_access_forbidden"))
}

async fn download_skill_revision(State(state): State<AppState>, headers: HeaderMap, Path(revision_id): Path<uuid::Uuid>) -> Result<Response,ApiError>{
    let user=authenticated_user(&state,&headers).await?;
    let key=state.database.skill_revision_blob_key(user,revision_id).await.map_err(|_|ApiError::internal("skill_revision_lookup_failed"))?.ok_or_else(||ApiError::forbidden("skill_share_access_forbidden"))?;
    let bytes=tokio::fs::read(blob_path(&state.blob_root,&key)).await.map_err(|_|ApiError::internal("blob_read_failed"))?;
    Ok(([(header::CONTENT_TYPE,"application/x-git-packed-objects")],bytes).into_response())
}

async fn withdraw_skill_share(State(state): State<AppState>, headers: HeaderMap, Path(share_id): Path<uuid::Uuid>) -> Result<StatusCode,ApiError>{
    let user=authenticated_user(&state,&headers).await?;
    if state.database.withdraw_skill_share(user,share_id).await.map_err(|_|ApiError::internal("skill_share_withdraw_failed"))?{Ok(StatusCode::NO_CONTENT)}else{Err(ApiError::forbidden("skill_share_withdraw_forbidden"))}
}

async fn list_session_shares(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<colab_server_persistence::SessionShare>>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    state
        .database
        .list_session_shares(user, channel_id)
        .await
        .map_err(|_| ApiError::internal("session_share_list_failed"))?
        .map(Json)
        .ok_or_else(|| ApiError::forbidden("channel_access_forbidden"))
}
async fn create_session_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<uuid::Uuid>,
    Json(request): Json<CreateSessionShareRequest>,
) -> Result<(StatusCode, Json<colab_server_persistence::SessionShare>), ApiError> {
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
}
async fn upload_session_segment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
    Query(query): Query<UploadSessionSegmentQuery>,
    body: Bytes,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    if body.is_empty()
        || query.source_cursor.len() > 4096
        || query.digest.len() != 64
        || !query.digest.chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(ApiError::bad_request("invalid_session_segment"));
    }
    let actual = hex::encode(sha2::Sha256::digest(&body));
    if actual != query.digest {
        return Err(ApiError::bad_request("session_segment_digest_mismatch"));
    }
    let key = uuid::Uuid::new_v4().simple().to_string();
    let path = blob_path(&state.blob_root, &key);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| ApiError::internal("blob_write_failed"))?
    }
    tokio::fs::write(&path, &body)
        .await
        .map_err(|_| ApiError::internal("blob_write_failed"))?;
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
            body.len() as i64,
        )
        .await
        .map_err(|_| ApiError::internal("session_segment_creation_failed"))?
    {
        Some((snapshot, segment)) => Ok((
            StatusCode::CREATED,
            Json(serde_json::json!({"snapshot":snapshot,"segment":segment})),
        )),
        None => {
            let _ = tokio::fs::remove_file(path).await;
            Err(ApiError::conflict("session_snapshot_conflict"))
        }
    }
}
async fn list_session_segments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    let chain = state
        .database
        .session_snapshot_chain(user, share_id)
        .await
        .map_err(|_| ApiError::internal("session_snapshot_list_failed"))?
        .ok_or_else(|| ApiError::forbidden("session_share_access_forbidden"))?;
    let current = chain.last().map(|x| &x.0);
    Ok(Json(
        serde_json::json!({"snapshot":current,"segments":chain.into_iter().map(|(_,s)|s).collect::<Vec<_>>() }),
    ))
}
async fn download_session_segment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(segment_id): Path<uuid::Uuid>,
) -> Result<Response, ApiError> {
    let user = authenticated_user(&state, &headers).await?;
    let key = state
        .database
        .session_segment_blob_key(user, segment_id)
        .await
        .map_err(|_| ApiError::internal("session_segment_lookup_failed"))?
        .ok_or_else(|| ApiError::forbidden("session_share_access_forbidden"))?;
    let file = tokio::fs::File::open(blob_path(&state.blob_root, &key))
        .await
        .map_err(|_| ApiError::internal("blob_read_failed"))?;
    Ok((
        [(header::CONTENT_TYPE, "application/x-ndjson")],
        Body::from_stream(ReaderStream::new(file)),
    )
        .into_response())
}
async fn withdraw_session_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(share_id): Path<uuid::Uuid>,
) -> Result<StatusCode, ApiError> {
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
}
async fn remove_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((channel_id, member_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<StatusCode, ApiError> {
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
}
async fn remove_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((channel_id, email)): Path<(uuid::Uuid, String)>,
) -> Result<StatusCode, ApiError> {
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
}

async fn authenticated_user(state: &AppState, headers: &HeaderMap) -> Result<uuid::Uuid, ApiError> {
    let token = bearer_token(headers)?;
    state
        .database
        .authenticate(token)
        .await
        .map_err(|error| {
            eprintln!("session lookup failed: {error:#}");
            ApiError::internal("session_lookup_failed")
        })?
        .ok_or_else(|| ApiError::unauthorized("invalid_session"))
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
