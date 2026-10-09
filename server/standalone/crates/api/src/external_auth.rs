//! Optional trusted identity broker. Provider details and secrets live outside product code.
use super::*;
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Config {
    pub provider: String,
    pub display_name: String,
    pub authorization_url: String,
    pub exchange_url: String,
    pub client_secret_file: PathBuf,
    #[serde(default)]
    pub directory_url: Option<String>,
    pub policy: Option<colab_server_persistence::ExternalPolicy>,
}
impl Config {
    pub fn load() -> anyhow::Result<Option<Self>> {
        let Some(path) = std::env::var_os("COLAB_EXTERNAL_AUTH_CONFIG") else { return Ok(None); };
        let config: Self = serde_json::from_slice(&std::fs::read(path)?)?;
        anyhow::ensure!(!config.provider.is_empty() && config.provider != "google" && config.provider.len() <= 64, "invalid external provider");
        let authorization = reqwest::Url::parse(&config.authorization_url)?;
        anyhow::ensure!(authorization.scheme() == "https" && authorization.host_str().is_some() && authorization.username().is_empty() && authorization.password().is_none() && authorization.query().is_none() && authorization.fragment().is_none(), "invalid authorization URL");
        if let Some(url) = &config.directory_url {
            let u=reqwest::Url::parse(url)?;
            anyhow::ensure!(u.scheme()=="http" && u.host_str()==Some("127.0.0.1") && u.username().is_empty() && u.password().is_none() && u.query().is_none() && u.fragment().is_none(), "directory must use loopback");
        }
        let exchange = reqwest::Url::parse(&config.exchange_url)?;
        anyhow::ensure!(exchange.username().is_empty() && exchange.password().is_none() && (exchange.scheme() == "https" || (exchange.scheme() == "http" && exchange.host_str() == Some("127.0.0.1"))), "exchange requires HTTPS or loopback");
        anyhow::ensure!(std::fs::read_to_string(&config.client_secret_file)?.trim().len() >= 43, "invalid broker secret");
        if let Some(policy) = &config.policy {
            anyhow::ensure!(policy.provider == config.provider && (300..=86400).contains(&policy.login_lifetime_seconds) && !policy.organization_name.is_empty(), "invalid external login policy");
        }
        Ok(Some(config))
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Exchange { code: String, code_verifier: String, redirect_uri: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity { provider: String, subject: String, email: String, display_name: Option<String>, avatar_url: Option<String>, expires_at: i64, #[serde(default)] link_approved: bool }

pub(super) async fn config(State(state): State<AppState>) -> Result<Json<serde_json::Value>, ApiError> {
    let config = state.external_auth.as_ref().ok_or_else(|| ApiError { status: StatusCode::NOT_FOUND, code: "external_login_unavailable", message: "External login is unavailable", retryable: false })?;
    Ok(Json(serde_json::json!({"provider": config.provider, "displayName": config.display_name, "authorizationUrl": config.authorization_url})))
}
pub(super) async fn session(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<Exchange>) -> Result<Json<colab_server_persistence::CreatedSession>, ApiError> {
    let config = state.external_auth.as_ref().ok_or_else(|| ApiError { status: StatusCode::NOT_FOUND, code: "external_login_unavailable", message: "External login is unavailable", retryable: false })?;
    if body.code.len() > 256 || !(43..=128).contains(&body.code_verifier.len()) || body.redirect_uri.len() > 256 { return Err(ApiError::bad_request("invalid_exchange")); }
    let link = if headers.contains_key(header::AUTHORIZATION) { Some(state.database.authenticate_for_identity_link(bearer_token(&headers)?).await.map_err(|_| ApiError::internal("identity_link_failed"))?.ok_or_else(|| ApiError::unauthorized("invalid_link_session"))?) } else { None };
    let secret = tokio::fs::read_to_string(&config.client_secret_file).await.map_err(|_| ApiError::internal("broker_configuration_unavailable"))?;
    let client = reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(10)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_| ApiError::internal("broker_client_failed"))?;
    let response = client.post(&config.exchange_url).bearer_auth(secret.trim()).json(&serde_json::json!({"code":body.code,"codeVerifier":body.code_verifier,"redirectUri":body.redirect_uri})).send().await.map_err(|_| ApiError::internal("broker_unavailable"))?;
    if !response.status().is_success() { return Err(ApiError::unauthorized("invalid_external_grant")); }
    let identity: Identity = response.json().await.map_err(|_| ApiError::internal("invalid_broker_response"))?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| ApiError::internal("invalid_clock"))?.as_secs() as i64;
    if identity.provider != config.provider || identity.expires_at <= now || identity.subject.is_empty() || identity.subject.len() > 256 || identity.email.is_empty() || identity.email.len() > 320 || (link.is_some() && !identity.link_approved) { return Err(ApiError::unauthorized("invalid_external_identity")); }
    state.database.create_identity_session(&identity.provider, &identity.subject, &identity.email, identity.display_name.as_deref(), identity.avatar_url.as_deref(), link).await.map(Json).map_err(|error| { eprintln!("external session creation failed: {error:#}"); ApiError::conflict("external_identity_link_failed") })
}
