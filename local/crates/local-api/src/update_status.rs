//! Read the updater's OS lock, not a browser's memory, as the running authority.
use serde_json::{Value, json};
use std::{fs, path::Path};

pub(super) fn read(root: &Path) -> Value {
    let mut value = fs::read(root.join("update-progress.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({"state":"idle"}));
    #[cfg(target_os = "macos")]
    let running = fs::File::open(root.join("update.lock"))
        .ok()
        .map(|file| matches!(file.try_lock(), Err(fs::TryLockError::WouldBlock)))
        .unwrap_or(false);
    #[cfg(not(target_os = "macos"))]
    let running = false;
    value["running"] = json!(running);
    let state = value["state"].as_str().unwrap_or("idle").to_owned();
    if running
        && matches!(
            state.as_str(),
            "idle" | "completed" | "failed" | "interrupted"
        )
    {
        value["state"] = json!("installing");
    } else if !running && matches!(state.as_str(), "downloading" | "verifying" | "installing") {
        value["state"] = json!("interrupted");
    }
    // A lost HTTP caller can leave a successfully activated Core waiting for restart.
    let activated = root.join("current/core/colabd").canonicalize().ok();
    let resident = std::env::current_exe()
        .ok()
        .and_then(|p| p.canonicalize().ok());
    value["restartRequired"] =
        json!(!running && activated.is_some() && resident.is_some() && activated != resident);
    value["previousPid"] = json!(std::process::id());
    value
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    #[test]
    fn lock_is_authority_even_when_progress_is_terminal_or_stale() {
        let root =
            std::env::temp_dir().join(format!("colab-update-status-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let lock = fs::File::create(root.join("update.lock")).unwrap();
        lock.lock().unwrap();
        fs::write(
            root.join("update-progress.json"),
            br#"{"state":"completed"}"#,
        )
        .unwrap();
        assert_eq!(read(&root)["running"], true);
        assert_eq!(read(&root)["state"], "installing");
        lock.unlock().unwrap();
        fs::write(
            root.join("update-progress.json"),
            br#"{"state":"downloading"}"#,
        )
        .unwrap();
        assert_eq!(read(&root)["running"], false);
        assert_eq!(read(&root)["state"], "interrupted");
        fs::remove_dir_all(root).unwrap();
    }
}
