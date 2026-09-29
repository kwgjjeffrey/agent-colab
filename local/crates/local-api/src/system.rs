//! Installation and update adapter.
//!
//! The Python setup artifact remains the single mutation authority. Local Core exposes a narrow,
//! allow-listed API so GUI and headless callers observe and invoke exactly the same receipts and
//! target adapters instead of reimplementing filesystem installation in React.

use super::*;

const SUPPORTED_AGENTS: &[&str] = &["codex", "claude", "myflicker"];

async fn default_agent(state: &AppState) -> String {
    let store = state.inner.store.lock().await;
    store
        .query_row(
            "select value from local_settings where key='default_agent'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "codex".into())
}

fn setup_path() -> Result<PathBuf, LocalError> {
    if let Some(path) = std::env::var_os("COLAB_SETUP_PATH") {
        return Ok(path.into());
    }
    #[cfg(target_os = "windows")]
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let managed = PathBuf::from(local).join("AgentColab/current/skill/setup/colab-setup");
        if managed.exists() {
            return Ok(managed);
        }
    }
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or_else(|| LocalError::internal("user home directory is unavailable"))?;
    let home = PathBuf::from(home);
    let managed = home.join(".local/share/agent-colab/current/skill/setup/colab-setup");
    if managed.exists() {
        Ok(managed)
    } else {
        Ok(home.join(".agents/skills/agent-colab/setup/colab-setup"))
    }
}

async fn setup(arguments: Vec<String>) -> Result<serde_json::Value, LocalError> {
    tokio::task::spawn_blocking(move || {
        let setup = setup_path()?;
        #[cfg(target_os = "windows")]
        // The Windows Python distribution guarantees the `py` launcher more
        // consistently than a `python.exe` entry on PATH.
        let output = Command::new(std::env::var_os("COLAB_PYTHON").unwrap_or_else(|| "py".into()))
            .arg(setup)
            .args(arguments)
            .output()
            .map_err(LocalError::internal)?;
        #[cfg(not(target_os = "windows"))]
        let output = Command::new(setup)
            .args(arguments)
            .output()
            .map_err(LocalError::internal)?;
        if !output.status.success() {
            return Err(LocalError::internal(String::from_utf8_lossy(
                &output.stderr,
            )));
        }
        serde_json::from_slice(&output.stdout).map_err(LocalError::internal)
    })
    .await
    .map_err(LocalError::internal)?
}

pub(super) async fn installation_status(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, LocalError> {
    let operation = if query.get("refresh").is_some_and(|value| value == "true") {
        "check"
    } else {
        "status"
    };
    let mut value = setup(vec![operation.into()]).await?;
    value["defaultAgent"] = serde_json::Value::String(default_agent(&state).await);
    Ok(Json(value))
}

pub(super) async fn update_installation() -> Result<Json<serde_json::Value>, LocalError> {
    // Updating the files is safe while the old executable is resident. The response must reach
    // the GUI before this process exits, so setup only activates symlinks here. A managed service
    // then exits after a short grace period and launchd starts the newly activated Core.
    let mut value = setup(vec!["update".into(), "--no-restart".into()]).await?;
    let manager = std::env::var("COLAB_MANAGED_SERVICE").unwrap_or_default();
    let managed = matches!(manager.as_str(), "launchd" | "windows-task");
    value["restartScheduled"] = serde_json::Value::Bool(managed);
    value["previousPid"] = serde_json::Value::from(std::process::id());
    if managed {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // The scheduled task cannot start a second Core while this process still owns the
            // stable port. Launch a detached, delayed trigger so the HTTP response is delivered,
            // this process exits, and only then the task starts the newly activated binary.
            let _ = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-WindowStyle", "Hidden",
                    "-Command",
                    "Start-Sleep -Seconds 2; Start-ScheduledTask -TaskName 'AgentColabCore'",
                ])
                .creation_flags(0x08000000 | 0x00000008)
                .spawn();
        }
        tokio::spawn(async {
            tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
            std::process::exit(0);
        });
    }
    Ok(Json(value))
}

pub(super) async fn update_shell() -> Result<Json<serde_json::Value>, LocalError> {
    setup(vec!["update-shell".into()]).await.map(Json)
}

async fn mutate_agent(
    agent: String,
    operation: &str,
) -> Result<Json<serde_json::Value>, LocalError> {
    if !SUPPORTED_AGENTS.contains(&agent.as_str()) {
        return Err(LocalError::bad_request("Unsupported Agent target"));
    }
    setup(vec![operation.into(), "--agent".into(), agent])
        .await
        .map(Json)
}

pub(super) async fn set_default_agent(
    State(state): State<AppState>,
    AxumPath(agent): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
    if !SUPPORTED_AGENTS.contains(&agent.as_str()) {
        return Err(LocalError::bad_request("Unsupported Agent target"));
    }
    let store = state.inner.store.lock().await;
    store.execute("insert into local_settings(key,value) values('default_agent',?1) on conflict(key) do update set value=excluded.value",[&agent]).map_err(LocalError::internal)?;
    Ok(Json(serde_json::json!({"defaultAgent":agent})))
}

pub(super) async fn open_agent(
    AxumPath(agent): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
    #[cfg(target_os = "macos")]
    let app = match agent.as_str() {
        "codex" => "ChatGPT",
        "claude" => "Claude",
        "myflicker" => "MyFlicker",
        _ => return Err(LocalError::bad_request("Unsupported Agent target")),
    };
    #[cfg(target_os = "macos")]
    Command::new("open")
        .args(["-a", app])
        .spawn()
        .map_err(LocalError::internal)?;

    // Windows applications register URI handlers. `start` lets Windows resolve the
    // installed package without baking mutable installation paths into Local Core.
    #[cfg(target_os = "windows")]
    {
        let uri = match agent.as_str() {
            "codex" => "chatgpt://",
            "claude" => "claude://",
            "myflicker" => "myflicker://",
            _ => return Err(LocalError::bad_request("Unsupported Agent target")),
        };
        Command::new("cmd")
            .args(["/C", "start", "", uri])
            .spawn()
            .map_err(LocalError::internal)?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err(LocalError::bad_request(
        "Opening Agent applications is not supported on this platform yet",
    ));
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn install_agent(
    AxumPath(agent): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
    mutate_agent(agent, "install-agent").await
}

pub(super) async fn uninstall_agent(
    AxumPath(agent): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
    mutate_agent(agent, "uninstall-agent").await
}
