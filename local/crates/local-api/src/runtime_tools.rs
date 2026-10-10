//! Server describes semantic tools; the executing Core binds them to its own installed artifact.
//! Neither company names nor another installation's discovery endpoint enter this boundary.
use super::*;

pub(super) fn bind(prompt: &str) -> Result<String, LocalError> {
    // Compatibility is limited to old Server-generated command lines during a rolling upgrade.
    // Do not rewrite public names/domains occurring in the user's prose or resource contents.
    let legacy = "~/.agents/skills/agent-colab/bin/";
    let prompt = prompt.lines().map(|line| {
        let command = line.trim_start().starts_with(legacy)
            || (line.starts_with("COLAB_TRACEPARENT=") && line.contains(legacy));
        if command { line.replace(legacy, "@COLAB_SKILL_BIN@/") } else { line.to_owned() }
    }).collect::<Vec<_>>().join("\n");
    if !prompt.contains("@COLAB_SKILL_BIN@") { return Ok(prompt); }
    let setup = std::env::var_os("COLAB_SETUP_PATH")
        .map(PathBuf::from)
        .ok_or_else(|| LocalError::internal("Managed Skill location is missing; run this installation's setup"))?;
    let root = setup.parent().and_then(Path::parent)
        .ok_or_else(|| LocalError::internal("Invalid managed Skill location"))?;
    // A missing target artifact must fail explicitly rather than discovering a different variant.
    let config: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("artifact-config.json")).map_err(LocalError::internal)?
    ).map_err(LocalError::internal)?;
    if config["skill"]["name"].as_str().is_none() || !root.join("bin/colab-messages").is_file() {
        return Err(LocalError::internal("Installed Skill artifact is incomplete"));
    }
    let mut rendered = render(&prompt, &root.join("bin"));
    // A foreign Codex writer does not inherit this Core's environment. Pin local discovery in
    // every executable tool line so it cannot select another installed variant/account store.
    let mut env = String::new();
    for name in ["COLAB_APPLICATION_ROOT", "COLAB_DISCOVERY_FILE"] {
        if let Ok(value) = std::env::var(name) {
            env.push_str(&format!("{name}='{}' ", value.replace('\'', "'\"'\"'")));
        }
    }
    if !env.is_empty() {
        let command = format!("'{}'/",root.join("bin").to_string_lossy().replace('\'', "'\"'\"'"));
        rendered = rendered.lines().map(|line| {
            if line.starts_with(&command) || (line.starts_with("COLAB_TRACEPARENT=") && line.contains(&command)) {
                format!("{env}{line}")
            } else { line.to_owned() }
        }).collect::<Vec<_>>().join("\n");
    }
    Ok(rendered)
}

fn render(prompt: &str, bin: &Path) -> String {
    // Quoting belongs to command generation, never a global substitution of public URLs/names.
    let quoted = format!("'{}'", bin.to_string_lossy().replace('\'', "'\"'\"'"));
    prompt.replace("@COLAB_SKILL_BIN@", &quoted)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tools_bind_to_each_artifact_without_changing_user_text() {
        let source = "@COLAB_SKILL_BIN@/colab-messages request reply\npublic agent-colab documentation";
        for root in ["/tmp/public/current/skill/bin", "/tmp/enterprise/current/skill/bin", "/tmp/it's a skill/bin"] {
            let rendered = render(source, Path::new(root));
            assert!(!rendered.contains("@COLAB_SKILL_BIN@"));
            assert!(rendered.ends_with("public agent-colab documentation"));
            let words = shell_words::split(rendered.lines().next().unwrap()).unwrap();
            assert_eq!(words[0], format!("{root}/colab-messages"));
        }
    }
}
