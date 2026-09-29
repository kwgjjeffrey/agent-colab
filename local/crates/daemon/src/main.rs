use anyhow::Context;
use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use tokio::net::TcpListener;
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Discovery {
    endpoint: String,
    bearer: String,
    pid: u32,
    api_version: String,
}

/// Recover the installation-scoped Local API identity published by an earlier Core process.
///
/// The browser cookie is derived from this bearer, so rotating either the port or bearer on every
/// process restart would strand every ordinary browser tab. The file is already private to the OS
/// user (0600); same-user processes can read it regardless of rotation. Stability therefore buys
/// browser recovery without weakening the actual local trust boundary.
fn reusable_discovery(path: &std::path::Path) -> Option<Discovery> {
    #[cfg(unix)]
    if std::fs::metadata(path).ok()?.permissions().mode() & 0o077 != 0 {
        return None;
    }
    let discovery: Discovery = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    let port = discovery
        .endpoint
        .strip_prefix("http://localhost:")
        .or_else(|| discovery.endpoint.strip_prefix("http://127.0.0.1:"))?
        .parse::<u16>()
        .ok()?;
    if port == 0 || discovery.bearer.len() < 64 || discovery.api_version != "v1" {
        return None;
    }
    Some(discovery)
}

/// Publish connection data only after the listener exists. The temp-file + rename sequence keeps
/// readers from observing a partially written token during Core restarts.
fn write_discovery(path: &std::path::Path, discovery: &Discovery) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("create discovery directory")?;
    }
    let temporary = path.with_extension(format!("tmp-{}", std::process::id()));
    std::fs::write(&temporary, serde_json::to_vec_pretty(discovery)?)?;
    #[cfg(unix)]
    std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600))?;
    std::fs::rename(&temporary, path).context("activate discovery file")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_is_complete_and_private() {
        let directory = std::env::temp_dir().join(format!(
            "agent-colab-discovery-test-{}",
            Uuid::new_v4().simple()
        ));
        let path = directory.join("discovery.json");
        let discovery = Discovery {
            endpoint: "http://localhost:43123".into(),
            bearer: "secret".into(),
            pid: 42,
            api_version: "v1".into(),
        };
        write_discovery(&path, &discovery).unwrap();
        let parsed: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(parsed["endpoint"], discovery.endpoint);
        assert!(reusable_discovery(&path).is_none());
        #[cfg(unix)]
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o077,
            0
        );
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn private_high_entropy_identity_is_reused() {
        let directory = std::env::temp_dir().join(format!(
            "agent-colab-reusable-discovery-test-{}",
            Uuid::new_v4().simple()
        ));
        let path = directory.join("discovery.json");
        let discovery = Discovery {
            endpoint: "http://localhost:43123".into(),
            bearer: "a".repeat(64),
            pid: 42,
            api_version: "v1".into(),
        };
        write_discovery(&path, &discovery).unwrap();
        let reused = reusable_discovery(&path).unwrap();
        assert_eq!(reused.endpoint, discovery.endpoint);
        assert_eq!(reused.bearer, discovery.bearer);
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::from_filename(".env.local");
    let credentials = std::env::var("COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE")
        .context("COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE is required")?;
    let server_url =
        std::env::var("COLAB_SERVER_URL").unwrap_or_else(|_| "http://127.0.0.1:8787".to_owned());
    let database_path = match std::env::var("COLAB_LOCAL_DATABASE_PATH") {
        Ok(path) => std::path::PathBuf::from(path),
        Err(_) => {
            let project = directories::ProjectDirs::from("online", "agent-colab", "Colab")
                .context("resolve operating-system application data directory")?;
            let data_dir = project.data_dir().to_path_buf();
            // Migrate the early development layout once. Relative runtime state must never remain
            // inside a source checkout: it leaks implementation paths into Agent handoffs and can
            // accidentally be committed or deleted with the repository.
            let legacy = std::path::PathBuf::from(".data");
            if legacy.exists() && !data_dir.exists() {
                std::fs::create_dir_all(data_dir.parent().unwrap())?;
                std::fs::rename(&legacy, &data_dir).context("migrate legacy Local Core data")?;
            }
            data_dir.join("colab.sqlite3")
        }
    };
    let discovery_path = std::env::var_os("COLAB_DISCOVERY_FILE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| database_path.parent().unwrap().join("discovery.json"));
    let prior_identity = if std::env::var_os("COLAB_LOCAL_ADDRESS").is_none() {
        reusable_discovery(&discovery_path)
    } else {
        None
    };
    let listen_address = std::env::var("COLAB_LOCAL_ADDRESS").unwrap_or_else(|_| {
        prior_identity
            .as_ref()
            .and_then(|discovery| discovery.endpoint.rsplit_once(':'))
            .map(|(_, port)| format!("127.0.0.1:{port}"))
            .unwrap_or_else(|| "127.0.0.1:0".to_owned())
    });
    let listener = TcpListener::bind(&listen_address)
        .await
        .with_context(|| format!("bind stable local API at {listen_address}"))?;
    let address = listener.local_addr().context("read local API address")?;
    let bearer = prior_identity
        .map(|discovery| discovery.bearer)
        .unwrap_or_else(|| format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()));
    let state = colab_local_api::AppState::load(
        credentials,
        &database_path,
        format!(
            "http://localhost:{}/v1/auth/google/callback",
            address.port()
        ),
        server_url,
    )?;
    state.start_file_sync();
    let endpoint = format!("http://localhost:{}", address.port());
    write_discovery(
        &discovery_path,
        &Discovery {
            endpoint: endpoint.clone(),
            bearer: bearer.clone(),
            pid: std::process::id(),
            api_version: "v1".into(),
        },
    )?;
    println!("colabd listening on {endpoint}");
    axum::serve(
        listener,
        colab_local_api::router(
            state,
            colab_local_api::LocalSecurity::new(address.port(), bearer),
        ),
    )
    .await
    .context("serve local API")
}
