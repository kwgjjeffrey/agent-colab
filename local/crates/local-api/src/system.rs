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

pub(super) async fn update_progress() -> Json<serde_json::Value> {
    let root = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(".local/share/agent-colab");
    Json(super::update_status::read(&root))
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
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.setup", async {

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
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Setup is a subprocess and may emit third-party diagnostics containing local paths.
            // Return only its final bounded summary to the GUI; full diagnostics stay local.
            let summary = stderr
                .lines()
                .rev()
                .find(|line| !line.trim().is_empty())
                .unwrap_or("Agent Colab setup failed");
            return Err(LocalError::internal(
                summary.chars().take(500).collect::<String>(),
            ));
        }
        serde_json::from_slice(&output.stdout).map_err(LocalError::internal)
    })
    .await
    .map_err(LocalError::internal)?

}).await
}

pub(super) async fn installation_status(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.installation-status", async {

    let operation = if query.get("refresh").is_some_and(|value| value == "true") {
        "check"
    } else {
        "status"
    };
    let mut value = setup(vec![operation.into()]).await?;
    value["shellUpdatePending"] = serde_json::Value::Bool(
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_default()
            .join(".local/share/agent-colab/pending-shell-update.json")
            .exists(),
    );
    value["defaultAgent"] = serde_json::Value::String(default_agent(&state).await);
    // Existing installations predate runtime registration. Refresh them whenever Settings reads
    // status so every logged-in device converges without forcing users to reinstall the Skill.
    let skill_version = value
        .pointer("/componentVersions/colab-skill")
        .and_then(|v| v.as_str())
        .unwrap_or(env!("CARGO_PKG_VERSION"))
        .to_string();
    let installed = SUPPORTED_AGENTS
        .iter()
        .filter(|agent| {
            value
                .pointer(&format!("/targets/{agent}/installed"))
                .and_then(|v| v.as_bool())
                == Some(true)
        })
        .copied()
        .collect::<Vec<_>>();
    for agent in installed {
        let _ = register_runtime(&state, agent, true, &skill_version).await;
    }
    Ok(Json(value))

}).await
}

pub(super) async fn update_installation() -> Result<Json<serde_json::Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.update-installation", async {

    let Json(mut current) = update_progress().await;
    if current["running"] == true {
        current["alreadyRunning"] = serde_json::json!(true);
        return Ok(Json(current));
    }
    // Updating the files is safe while the old executable is resident. This request only activates
    // symlinks and reports that a restart is required. Exiting from this handler is racy: a large
    // JSON response can still be buffered when the timer fires, leaving the GUI with a misleading
    // `Failed to fetch` even though setup succeeded. Restart is therefore a separate command whose
    // response is deliberately not part of the update transaction.
    let mut value = match setup(vec!["update".into(), "--no-restart".into()]).await {
        Ok(value) => value,
        Err(error) if error.message.contains("another Agent Colab update is already running") => {
            let Json(mut current) = update_progress().await;
            current["alreadyRunning"] = serde_json::json!(true);
            return Ok(Json(current));
        }
        Err(error) => return Err(error),
    };
    let manager = std::env::var("COLAB_MANAGED_SERVICE").unwrap_or_default();
    let managed = matches!(manager.as_str(), "launchd" | "windows-task");
    value["restartRequired"] = serde_json::Value::Bool(managed);
    value["previousPid"] = serde_json::Value::from(std::process::id());
    Ok(Json(value))

}).await
}

pub(super) async fn restart_managed() -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.restart-managed", async {

    let manager = std::env::var("COLAB_MANAGED_SERVICE").unwrap_or_default();
    if !matches!(manager.as_str(), "launchd" | "windows-task") {
        return Err(LocalError::bad_request(
            "Local Core is not managed by a service",
        ));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                "Start-Sleep -Seconds 2; Start-ScheduledTask -TaskName 'AgentColabCore'",
            ])
            .creation_flags(0x08000000 | 0x00000008)
            .spawn();
    }
    // The caller treats connection loss as success and probes for a new PID. Keeping this endpoint
    // separate prevents an ambiguous network failure from being mistaken for an update failure.
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        std::process::exit(0);
    });
    Ok(StatusCode::ACCEPTED)

}).await
}

pub(super) async fn update_shell() -> Result<Json<serde_json::Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.update-shell", async {

    setup(vec!["update-shell".into()]).await.map(Json)

}).await
}

async fn runtime_identity(state: &AppState) -> Result<(String, String), LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.runtime-identity", async {

    let store = state.inner.store.lock().await;
    let id: String = match store.query_row(
        "select value from local_settings where key='device_id'",
        [],
        |row| row.get(0),
    ) {
        Ok(value) => value,
        Err(_) => {
            let value = uuid::Uuid::new_v4().to_string();
            store
                .execute(
                    "insert into local_settings(key,value) values('device_id',?1)",
                    [&value],
                )
                .map_err(LocalError::internal)?;
            value
        }
    };
    // GUI services launched by launchd do not reliably inherit HOSTNAME. Ask the operating system
    // once and persist the human-readable label; the random device UUID remains the stable key.
    let fallback = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            Command::new("hostname")
                .output()
                .ok()
                .filter(|output| output.status.success())
                .and_then(|output| String::from_utf8(output.stdout).ok())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| "This device".into());
    let name: String = store
        .query_row(
            "select value from local_settings where key='device_name'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(fallback);
    Ok((id, name))

}).await
}

async fn register_runtime(
    state: &AppState,
    agent: &str,
    available: bool,
    skill_version: &str,
) -> Result<serde_json::Value, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.register-runtime", async {

    let organization = current_organization_id(state).await?;
    let (device_id, device_name) = runtime_identity(state).await?;
    let token = access_token(state).await?;
    let response=state.inner.http.post(format!("{}/v1/organizations/{organization}/agent-runtimes/register",state.inner.server_url)).bearer_auth(token).json(&serde_json::json!({"deviceId":device_id,"deviceName":device_name,"provider":agent,"skillVersion":skill_version,"available":available})).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let value: serde_json::Value = response.json().await.map_err(LocalError::internal)?;
    if let Some(id) = value.get("id").and_then(|value| value.as_str()) {
        let user_id = current_user_id(state).await?;
        let store = state.inner.store.lock().await;
        // Runtime ownership is account-scoped. A foreground account switch must not retarget or
        // disable a runtime previously registered for another saved account on this device.
        store.execute("insert into local_settings(key,value) values(?1,?2) on conflict(key) do update set value=excluded.value",rusqlite::params![format!("runtime_id:{user_id}:{agent}"),id]).map_err(LocalError::internal)?;
    }
    Ok(value)

}).await
}

async fn mutate_agent(
    state: &AppState,
    agent: String,
    operation: &str,
) -> Result<Json<serde_json::Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.mutate-agent", async {

    if !SUPPORTED_AGENTS.contains(&agent.as_str()) {
        return Err(LocalError::bad_request("Unsupported Agent target"));
    }
    let value = setup(vec![operation.into(), "--agent".into(), agent.clone()]).await?;
    let available = operation != "uninstall-agent";
    let version = value
        .get("version")
        .and_then(|value| value.as_str())
        .unwrap_or(env!("CARGO_PKG_VERSION"));
    let runtime = register_runtime(state, &agent, available, version).await?;
    Ok(Json(
        serde_json::json!({"installation":value,"runtime":runtime}),
    ))

}).await
}

pub(super) async fn set_default_agent(
    State(state): State<AppState>,
    AxumPath(agent): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.set-default-agent", async {

    if !SUPPORTED_AGENTS.contains(&agent.as_str()) {
        return Err(LocalError::bad_request("Unsupported Agent target"));
    }
    let store = state.inner.store.lock().await;
    store.execute("insert into local_settings(key,value) values('default_agent',?1) on conflict(key) do update set value=excluded.value",[&agent]).map_err(LocalError::internal)?;
    Ok(Json(serde_json::json!({"defaultAgent":agent})))

}).await
}

pub(super) async fn open_agent(
    AxumPath(agent): AxumPath<String>,
) -> Result<StatusCode, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.open-agent", async {

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

}).await
}

pub(super) async fn install_agent(
    State(state): State<AppState>,
    AxumPath(agent): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.install-agent", async {

    mutate_agent(&state, agent, "install-agent").await

}).await
}

pub(super) async fn uninstall_agent(
    State(state): State<AppState>,
    AxumPath(agent): AxumPath<String>,
) -> Result<Json<serde_json::Value>, LocalError> {
colab_observability::registered_business(include_str!("../../../tracing/registry.json"), "core.system.uninstall-agent", async {

    mutate_agent(&state, agent, "uninstall-agent").await

}).await
}
