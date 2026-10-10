//! Only a hook-selected, frozen Codex extent is read. Historical context is three human queries.
use super::*;
use std::io::{BufRead, BufReader, Read, Write};

pub(super) fn transcript_path(e: &Value, session: &str) -> Result<PathBuf, LocalError> {
    let path = fs::canonicalize(
        e["transcript_path"]
            .as_str()
            .ok_or_else(|| LocalError::bad_request("Hook has no transcript"))?,
    )
    .map_err(LocalError::internal)?;
    let home = std::env::var_os("HOME")
        .ok_or_else(|| LocalError::bad_request("Missing home directory"))?;
    let root = fs::canonicalize(PathBuf::from(home).join(".codex/sessions"))
        .map_err(LocalError::internal)?;
    if !path.starts_with(root)
        || !path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.ends_with(&format!("-{session}.jsonl")))
    {
        return Err(LocalError::bad_request(
            "Hook transcript is outside the Codex Session store",
        ));
    }
    Ok(path)
}
fn input_paths(e: &Value) -> Vec<PathBuf> {
    let mut paths = vec![];
    let input = &e["tool_input"];
    // Structured read tools report the consumed path directly.
    if matches!(
        e["tool_name"].as_str(),
        Some("Read" | "read_file" | "view_image")
    ) {
        for key in ["file_path", "path"] {
            if let Some(path) = input[key].as_str() {
                paths.push(PathBuf::from(path))
            }
        }
    }
    let command = input["command"].as_str().or_else(|| input["cmd"].as_str());
    if let Some(command) = command {
        let mut parser = tree_sitter::Parser::new();
        if parser
            .set_language(&tree_sitter_bash::LANGUAGE.into())
            .is_ok()
        {
            if let Some(tree) = parser.parse(command, None) {
                collect_commands(tree.root_node(), command.as_bytes(), &mut paths);
            }
        }
    }
    paths
}
fn collect_commands(node: tree_sitter::Node, source: &[u8], paths: &mut Vec<PathBuf>) {
    if matches!(
        node.kind(),
        "function_definition"
            | "if_statement"
            | "case_statement"
            | "for_statement"
            | "while_statement"
    ) {
        return;
    }
    if node.kind() == "command" {
        if let Some(name) = node
            .child_by_field_name("name")
            .and_then(|n| n.utf8_text(source).ok())
        {
            if let Ok(words) = shell_words::split(name) {
                if let Some(name) = words.first() {
                    let read = matches!(
                        Path::new(name).file_name().and_then(|s| s.to_str()),
                        Some(
                            "cat"
                                | "sed"
                                | "head"
                                | "tail"
                                | "rg"
                                | "python"
                                | "python3"
                                | "bash"
                                | "sh"
                        )
                    );
                    if name.contains('/') {
                        paths.push(PathBuf::from(name))
                    }
                    if read {
                        let mut cursor = node.walk();
                        for arg in node.children_by_field_name("argument", &mut cursor) {
                            if let Ok(text) = arg.utf8_text(source) {
                                if !text.contains('$') && !text.contains('`') {
                                    if let Ok(words) = shell_words::split(text) {
                                        if words.len() == 1 && !words[0].starts_with('-') {
                                            paths.push(PathBuf::from(&words[0]));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        collect_commands(child, source, paths);
    }
}
pub(super) async fn observe(
    s: &AppState,
    u: &str,
    session: &str,
    turn: &str,
    e: &Value,
) -> Result<(), LocalError> {
    let cwd = PathBuf::from(e["cwd"].as_str().unwrap_or("."));
    let paths: Vec<_> = input_paths(e)
        .into_iter()
        .filter_map(|p| {
            let path = if let Some(rest) = p.to_str().and_then(|s| s.strip_prefix("~/")) {
                std::env::var_os("HOME")
                    .map(PathBuf::from)
                    .map(|home| home.join(rest))
                    .unwrap_or(p)
            } else {
                p
            };
            fs::canonicalize(if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            })
            .ok()
        })
        .collect();
    if paths.is_empty() {
        return Ok(());
    }
    let receipts = {
        let store = s.inner.store.lock().await;
        let mut q=store.prepare("select installed_path,share_id,source_channel_key,installed_root_oid from skill_installations where user_id=?1 and target_agent='codex'").map_err(LocalError::internal)?;
        q.query_map([u], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(LocalError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(LocalError::internal)?
    };
    let managed_roots: Vec<_> = receipts
        .iter()
        .filter_map(|(root, _, _, _)| fs::canonicalize(root).ok())
        .collect();
    let mut identities = vec![];
    for (root, asset, channel, version) in receipts {
        if let Ok(root) = fs::canonicalize(root) {
            if paths.iter().any(|p| p.starts_with(&root)) {
                identities.push((
                    format!("asset:{asset}"),
                    channel,
                    version,
                    skills::read_skill_metadata(&root)
                        .map(|m| m.0)
                        .unwrap_or_else(|_| asset.clone()),
                ))
            }
        }
    }
    // Bind to this Core's installed Skill, never another variant's supported slot.
    let roots = builtin_roots(std::env::var_os("COLAB_SETUP_PATH"), std::env::var_os("HOME"));
    {
        for root in roots {
            if let Ok(root) = fs::canonicalize(root) {
                if paths.iter().any(|p| {
                    p.starts_with(&root)
                        && !managed_roots.iter().any(|managed| p.starts_with(managed))
                }) {
                    let version = fs::read_to_string(root.join("installed.json"))
                        .or_else(|_| fs::read_to_string(root.join("packaging/artifact.json")))
                        .ok()
                        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                        .and_then(|v| v["version"].as_str().map(str::to_owned))
                        .unwrap_or_else(|| "unknown:installed-version".into());
                    identities.push((
                        "builtin:agent-colab".into(),
                        "builtin:agent-colab".into(),
                        version,
                        "Agent Colab".into(),
                    ));
                }
            }
        }
    }
    let store = s.inner.store.lock().await;
    for (asset, channel, version, name) in identities {
        store.execute("insert or ignore into feedback_observations(user_id,session_id,turn_id,asset_key,channel_key,skill_version,skill_name) values(?1,?2,?3,?4,?5,?6,?7)",rusqlite::params![u,session,turn,asset,channel,version,name]).map_err(LocalError::internal)?;
    }
    Ok(())
}
pub(super) fn freeze(e: &Value, session: &str, dir: &Path) -> Result<(PathBuf, Value), LocalError> {
    let source = transcript_path(e, session)?;
    freeze_source(e, session, dir, &source)
}
fn freeze_source(
    e: &Value,
    session: &str,
    dir: &Path,
    source: &Path,
) -> Result<(PathBuf, Value), LocalError> {
    let file = fs::File::open(&source).map_err(LocalError::internal)?;
    let extent = e["frozenExtent"]
        .as_u64()
        .ok_or_else(|| LocalError::bad_request("Missing frozen extent"))?;
    let mut reader = BufReader::new(file.take(extent));
    let mut line = vec![];
    let mut prior = std::collections::VecDeque::new();
    let mut selected = vec![];
    let mut current = false;
    let mut found = false;
    let mut verified = false;
    let mut host_version = Value::Null;
    let target = e["turn_id"].as_str().unwrap_or("");
    let mut bytes = 0;
    loop {
        line.clear();
        let n = reader
            .by_ref()
            .take(4 * 1024 * 1024 + 1)
            .read_until(b'\n', &mut line)
            .map_err(LocalError::internal)?;
        if n == 0 {
            break;
        }
        if n > 4 * 1024 * 1024 {
            // Earlier images/tool payloads are outside the selected turn. Drain without
            // retaining them; they must not prevent capture of a later bounded task.
            if !current {
                while !line.ends_with(b"\n") {
                    line.clear();
                    if reader.by_ref().take(4 * 1024 * 1024 + 1).read_until(b'\n', &mut line)
                        .map_err(LocalError::internal)? == 0 { break; }
                }
                continue;
            }
            return Err(LocalError::bad_request("Oversized transcript record"));
        }
        if !line.ends_with(b"\n") {
            break;
        }
        let v: Value = serde_json::from_slice(&line).map_err(LocalError::internal)?;
        if v["type"] == "session_meta" {
            verified = v.pointer("/payload/id").and_then(Value::as_str) == Some(session);
            host_version = v["payload"]["cli_version"].clone();
        }
        if v["type"] == "event_msg" && v["payload"]["type"] == "task_started" {
            if found && v["payload"]["turn_id"] != target { break; }
            current = v["payload"]["turn_id"] == target;
            if current {
                found = true;
                selected.push(v);
                continue;
            }
        }
        if !current
            && v["type"] == "response_item"
            && v["payload"]["type"] == "message"
            && v["payload"]["role"] == "user"
        {
            let text = v["payload"]["content"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            if let Some(text) = sessions::clean_user_text(&text) {
                prior.push_back(text);
                if prior.len() > 3 {
                    prior.pop_front();
                }
            }
        }
        if current
            && v["type"] == "response_item"
            && matches!(
                v["payload"]["type"].as_str(),
                Some(
                    "message"
                        | "function_call"
                        | "function_call_output"
                        | "custom_tool_call"
                        | "custom_tool_call_output"
                )
            )
        {
            if v["payload"]["role"] == "user" {
                let text = v["payload"]["content"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v["text"].as_str())
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_default();
                if sessions::clean_user_text(&text).is_none() {
                    continue;
                }
            }
            bytes += line.len();
            if bytes > 3 * 1024 * 1024 {
                return Err(LocalError::bad_request(
                    "Task fragment exceeds capture limit",
                ));
            }
            selected.push(v);
        }
    }
    if !verified || !found {
        return Err(LocalError::bad_request(
            "Hook Session or turn does not match transcript",
        ));
    }
    fs::create_dir_all(dir).map_err(LocalError::internal)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))
            .map_err(LocalError::internal)?;
    }
    let path = dir.join("session.jsonl");
    let stage = dir.join("session.jsonl.tmp");
    let mut output = fs::File::create(&stage).map_err(LocalError::internal)?;
    for (i, text) in prior.iter().enumerate() {
        let row = json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":text}],"feedbackContext":true,"contextIndex":i}});
        writeln!(output, "{row}").map_err(LocalError::internal)?;
    }
    for row in &selected {
        writeln!(output, "{row}").map_err(LocalError::internal)?;
    }
    if output.metadata().map_err(LocalError::internal)?.len() > 4 * 1024 * 1024 {
        drop(output);
        let _ = fs::remove_file(&stage);
        return Err(LocalError::bad_request(
            "Task and prior queries exceed capture limit",
        ));
    }
    output.sync_all().map_err(LocalError::internal)?;
    fs::rename(stage, &path).map_err(LocalError::internal)?;
    Ok((
        path,
        json!({"sessionId":session,"turnId":target,"hostVersion":host_version,"priorUserQueryCount":prior.len(),"captureScope":"turn_and_three_prior_user_queries","capturedAt":e["capturedAt"],"recordCount":selected.len(),"taskStartedAt":selected.first().and_then(|v|v.get("timestamp")),"taskCompletedAt":e["capturedAt"],"consumerModel":e["model"]}),
    ))
}
pub(super) async fn analyze(
    _s: &AppState,
    e: &Value,
    evidence: &Path,
    dir: &Path,
) -> Result<String, LocalError> {
    let executable =
        messaging::codex_binary().ok_or_else(|| LocalError::bad_request("No Codex executable"))?;
    let raw = tokio::fs::read_to_string(evidence)
        .await
        .map_err(LocalError::internal)?;
    let (raw, images) = analysis_input(&raw, dir)?;
    let package = system::setup_path()?
        .parent()
        .and_then(|p| p.parent())
        .ok_or_else(|| LocalError::internal("Missing installed Skill package"))?
        .to_owned();
    let template = tokio::fs::read_to_string(package.join("feedback/consumer-prompt.md"))
        .await
        .map_err(LocalError::internal)?;
    if template.len() > 65536 {
        return Err(LocalError::bad_request("Feedback prompt exceeds limit"));
    }
    let prompt = template
        .replace(
            "{{skillName}}",
            e["skillName"].as_str().unwrap_or("unknown"),
        )
        .replace(
            "{{skillVersion}}",
            e["skillVersion"].as_str().unwrap_or("unknown"),
        )
        .replace(
            "{{priorUserQueries}}",
            "以下片段开头 feedbackContext=true 的记录是前三段 query。",
        )
        .replace("{{taskFragment}}", &raw);
    let output = dir.join("analysis.md");
    let mut command = tokio::process::Command::new(executable);
    command
        .args([
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--disable",
            "hooks",
            "--disable",
            "shell_tool",
            "--disable",
            "multi_agent",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--output-last-message",
        ])
        .arg(&output);
    if let Some(model) = e["model"]
        .as_str()
        .filter(|m| !m.is_empty() && m.len() < 200)
    {
        command.args(["--model", model]);
    }
    for path in images { command.arg("--image").arg(path); }
    let mut child = command
        .arg("-")
        .current_dir(dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(LocalError::internal)?;
    {
        use tokio::io::AsyncWriteExt;
        child
            .stdin
            .take()
            .ok_or_else(|| LocalError::internal("Missing analysis stdin"))?
            .write_all(prompt.as_bytes())
            .await
            .map_err(LocalError::internal)?;
    }
    let status = tokio::time::timeout(std::time::Duration::from_secs(180), child.wait())
        .await
        .map_err(|_| LocalError::internal("Feedback analysis timed out"))?
        .map_err(LocalError::internal)?;
    if !status.success() {
        return Err(LocalError::internal("Feedback analysis failed"));
    }
    let text = tokio::fs::read_to_string(output)
        .await
        .map_err(LocalError::internal)?;
    if text.trim().is_empty() || text.len() > 65536 {
        return Err(LocalError::bad_request("Invalid analysis output"));
    }
    Ok(text)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_read_and_script_paths() {
        assert_eq!(
            input_paths(&json!({"tool_name":"Read","tool_input":{"file_path":"/tmp/SKILL.md"}})),
            vec![PathBuf::from("/tmp/SKILL.md")]
        );
        assert!(
            !input_paths(&json!({"tool_input":{"command":"cat '/tmp/skill/SKILL.md'"}})).is_empty()
        );
        assert!(
            input_paths(&json!({"tool_input":{"command":"echo '/tmp/skill/SKILL.md'"}})).is_empty()
        );
        assert!(
            input_paths(
                &json!({"tool_input":{"command":"cat /tmp/other; echo /tmp/skill/SKILL.md"}})
            )
            .iter()
            .all(|p| p != Path::new("/tmp/skill/SKILL.md"))
        );
    }
}

#[cfg(test)]
mod fragment_tests {
    use super::*;
    #[test]
    fn keeps_three_real_queries_and_frozen_current_turn() {
        let dir = std::env::temp_dir().join(format!("feedback-fragment-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.jsonl");
        let mut rows = vec![json!({"type":"session_meta","payload":{"id":"session"}})];
        rows.push(json!({"type":"response_item","payload":{"type":"function_call_output","output":"x".repeat(5 * 1024 * 1024)}}));
        for text in [
            "older",
            "one",
            "# AGENTS.md instructions for /tmp",
            "two",
            "<environment_context>host</environment_context>",
            "three",
        ] {
            rows.push(json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"text":text}]}}));
        }
        rows.push(
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"current"}}),
        );
        for (role, text) in [("user", "current question"), ("assistant", "final answer")] {
            rows.push(json!({"type":"response_item","payload":{"type":"message","role":role,"content":[{"text":text}]}}));
        }
        let text = rows.iter().map(|v| format!("{v}\n")).collect::<String>();
        fs::write(&source, format!("{text}{{\"type\":\"future\"}}\n")).unwrap();
        let e = json!({"frozenExtent":text.len(),"turn_id":"current"});
        let (path, meta) = freeze_source(&e, "session", &dir.join("evidence"), &source).unwrap();
        assert_eq!(meta["priorUserQueryCount"], 3);
        let captured = fs::read_to_string(path).unwrap();
        let queries: Vec<String> = captured
            .lines()
            .take(3)
            .map(|line| {
                serde_json::from_str::<Value>(line).unwrap()["payload"]["content"][0]["text"]
                    .as_str()
                    .unwrap()
                    .to_owned()
            })
            .collect();
        assert_eq!(queries, vec!["one", "two", "three"]);
        assert!(captured.contains("final answer"));
        assert!(!captured.contains("environment_context"));
        assert!(!captured.contains("future"));
        assert!(!captured.contains("older"));
        fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod conservative_detection_tests {
    use super::*;
    #[test]
    fn unexecuted_branches_and_definitions_are_not_usage() {
        assert!(
            input_paths(
                &json!({"tool_input":{"command":"if false; then cat /tmp/skill/SKILL.md; fi"}})
            )
            .is_empty()
        );
        assert!(
            input_paths(&json!({"tool_input":{"command":"f() { cat /tmp/skill/SKILL.md; }"}}))
                .is_empty()
        );
    }
}

fn builtin_roots(setup: Option<std::ffi::OsString>, home: Option<std::ffi::OsString>) -> Vec<PathBuf> {
    if let Some(setup) = setup {
        PathBuf::from(setup).parent().and_then(Path::parent)
            .map(|p| vec![p.to_path_buf()]).unwrap_or_default()
    } else if let Some(home) = home {
        vec![PathBuf::from(&home).join(".agents/skills/agent-colab"),
             PathBuf::from(home).join(".codex/skills/agent-colab")]
    } else { vec![] }
}
#[cfg(test)]
mod installation_tests {
    use super::*;
    #[test]
    fn managed_variants_never_include_each_others_skill() {
        for name in ["agent-colab", "enterprise-colab"] {
            let root = format!("/home/user/.agents/skills/{name}");
            assert_eq!(builtin_roots(Some(format!("{root}/setup/setup.py").into()), Some("/home/user".into())), vec![PathBuf::from(root)]);
        }
        assert!(builtin_roots(Some("invalid".into()), Some("/home/user".into())).is_empty());
    }
}

// Feed images through Codex's image input, rather than paying text tokens for base64.
fn analysis_input(raw: &str, dir: &Path) -> Result<(String, Vec<PathBuf>), LocalError> {
    use base64::Engine;
    let mut images = vec![];
    let mut lines = vec![];
    for line in raw.lines() {
        let mut row: Value = serde_json::from_str(line).map_err(LocalError::internal)?;
        if let Some(content) = row.pointer_mut("/payload/content").and_then(Value::as_array_mut) {
            for item in content {
                if item["type"] == "input_image" {
                    if let Some(url) = item["image_url"].as_str() {
                        if let Some((mime, data)) = url.strip_prefix("data:").and_then(|s| s.split_once(";base64,")) {
                            let ext = match mime { "image/png" => "png", "image/jpeg" => "jpg", "image/webp" => "webp", _ => return Err(LocalError::bad_request("Unsupported feedback image")) };
                            let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(LocalError::internal)?;
                            let path = dir.join(format!("image-{}.{}", images.len()+1, ext));
                            fs::write(&path, bytes).map_err(LocalError::internal)?;
                            images.push(path);
                            *item = json!({"type":"input_text","text":format!("[Attached image {}]",images.len())});
                        }
                    }
                }
            }
        }
        lines.push(row.to_string());
    }
    Ok((lines.join("\n"), images))
}
#[cfg(test)]
mod analysis_image_tests {
    use super::*;
    #[test]
    fn image_bytes_are_separate_from_analysis_text() {
        let dir = std::env::temp_dir().join(format!("feedback-images-{}",Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let raw = json!({"payload":{"content":[{"type":"input_text","text":"actual request"},{"type":"input_image","image_url":"data:image/png;base64,aW1hZ2U="}]}}).to_string();
        let (text, images) = analysis_input(&raw, &dir).unwrap();
        assert!(text.contains("actual request"));
        assert!(!text.contains("base64"));
        assert_eq!(images.len(),1);
        assert_eq!(fs::read(&images[0]).unwrap(),b"image");
        fs::remove_dir_all(dir).unwrap();
    }
}
