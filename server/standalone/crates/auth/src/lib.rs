use std::{fs, path::Path};

use anyhow::{Context, ensure};
use serde::Deserialize;

#[derive(Deserialize)]
struct CredentialFile {
    installed: InstalledClient,
}

#[derive(Deserialize)]
struct InstalledClient {
    client_id: String,
    client_secret: String,
    auth_uri: String,
    token_uri: String,
    redirect_uris: Vec<String>,
}

pub struct GoogleDesktopCredentials {
    pub client_id: String,
    client_secret: String,
    pub auth_uri: String,
    pub token_uri: String,
}

#[derive(Debug, Deserialize)]
pub struct GoogleIdentity {
    pub sub: String,
    pub email: String,
    #[serde(default)]
    pub email_verified: String,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub aud: String,
    pub iss: String,
    pub nonce: Option<String>,
}

impl GoogleDesktopCredentials {
    pub fn load(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let path = path.as_ref();
        let bytes = fs::read(path)
            .with_context(|| format!("read Google OAuth credentials from {}", path.display()))?;
        let file: CredentialFile = serde_json::from_slice(&bytes)
            .with_context(|| format!("parse Google OAuth credentials from {}", path.display()))?;

        ensure!(
            file.installed
                .redirect_uris
                .iter()
                .any(|uri| uri == "http://localhost"),
            "Google OAuth client must allow the native loopback redirect URI http://localhost"
        );

        Ok(Self {
            client_id: file.installed.client_id,
            client_secret: file.installed.client_secret,
            auth_uri: file.installed.auth_uri,
            token_uri: file.installed.token_uri,
        })
    }

    pub fn client_secret(&self) -> &str {
        &self.client_secret
    }
}

pub async fn verify_google_id_token(
    client: &reqwest::Client,
    id_token: &str,
    expected_client_id: &str,
    expected_nonce: &str,
) -> anyhow::Result<GoogleIdentity> {
    let response = client
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("id_token", id_token)])
        .send()
        .await
        .context("request Google tokeninfo")?
        .error_for_status()
        .context("Google rejected ID token")?;
    let identity: GoogleIdentity = response.json().await.context("parse Google identity")?;
    ensure!(
        identity.aud == expected_client_id,
        "Google token audience mismatch"
    );
    ensure!(
        identity.iss == "https://accounts.google.com" || identity.iss == "accounts.google.com",
        "Google token issuer mismatch"
    );
    ensure!(
        identity.email_verified == "true",
        "Google email is not verified"
    );
    ensure!(
        identity.nonce.as_deref() == Some(expected_nonce),
        "Google token nonce mismatch"
    );
    Ok(identity)
}
