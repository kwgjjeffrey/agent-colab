use serde_json::{Value,json};
fn project_codex(text: &str, include_outputs: bool, max_chars: usize) -> Vec<Value> {
    let mut turns = Vec::<Value>::new();
    for (index, line) in text.lines().enumerate() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let row_type = v.get("type").and_then(Value::as_str);
        let payload = v.get("payload").unwrap_or(&Value::Null);
        let payload_type = payload.get("type").and_then(Value::as_str);
        if row_type == Some("response_item") && payload_type == Some("message") {
            for block in payload["content"].as_array().into_iter().flatten() {
                if matches!(block["type"].as_str(), Some("tool_result" | "tool-result")) && include_outputs {
                    let call = block["tool_use_id"].as_str().or_else(|| block["toolCallId"].as_str()).unwrap_or("");
                    attach_result(&mut turns, call, &tool_result_text(block), max_chars);
                }
            }
        }
        if row_type == Some("event_msg") && payload_type == Some("task_started") {
            turns.push(json!({"id":payload.get("turn_id").and_then(Value::as_str).unwrap_or("turn"),"items":[]}));
            continue;
        }
        let user = if row_type == Some("response_item")
            && payload_type == Some("message")
            && payload.get("role").and_then(Value::as_str) == Some("user")
        {
            text_value(&payload["content"])
        } else if row_type == Some("event_msg") && payload_type == Some("user_message") {
            payload
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        };
        if let Some(raw) = user {
            let Some(clean) = clean_user_text(&raw) else {
                continue;
            };
            // Codex records the same user input as both a response item and an event.
            // These are two representations of one turn, not two user messages.
            if turns.last().and_then(|t| t["items"].as_array()).is_some_and(|items| {
                items.last().is_some_and(|item| item["type"] == "userMessage"
                    && item.pointer("/content/0/text").and_then(Value::as_str) == Some(clean.as_str()))
            }) {
                continue;
            }
            if turns
                .last()
                .and_then(|t| t["items"].as_array())
                .is_none_or(|items| items.iter().any(|i| i["type"] == "userMessage"))
            {
                turns.push(json!({"id":format!("turn-{index}"),"items":[]}));
            }
            push_item(
                &mut turns,
                json!({"type":"userMessage","content":[{"type":"text","text":clean}]}),
                index,
            );
            continue;
        }
        if row_type == Some("response_item")
            && payload_type == Some("message")
            && payload.get("role").and_then(Value::as_str) == Some("assistant")
        {
            if let Some(text) = text_value(&payload["content"]) {
                push_item(
                    &mut turns,
                    json!({"type":"agentMessage","text":text,"phase":payload.get("phase")}),
                    index,
                )
            };
            continue;
        }
        if row_type == Some("event_msg") && payload_type == Some("agent_message") {
            if let Some(text) = payload.get("message").and_then(Value::as_str) {
                push_item(
                    &mut turns,
                    json!({"type":"agentMessage","text":text,"phase":payload.get("phase")}),
                    index,
                )
            };
            continue;
        }
        if row_type == Some("response_item")
            && matches!(
                payload_type,
                Some("function_call") | Some("custom_tool_call")
            )
        {
            let call = payload
                .get("call_id")
                .or_else(|| payload.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("call");
            let tool = payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let arguments = payload
                .get("arguments")
                .or_else(|| payload.get("input"))
                .cloned()
                .unwrap_or(Value::Null);
            let arguments = arguments
                .as_str()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or(arguments);
            let kind = if matches!(tool, "exec_command" | "shell" | "bash") {
                "commandExecution"
            } else {
                "mcpToolCall"
            };
            push_item(
                &mut turns,
                json!({"type":kind,"id":call,"server":"codex","tool":tool,"arguments":arguments,"status":"inProgress"}),
                index,
            );
            continue;
        }
        if include_outputs
            && row_type == Some("response_item")
            && matches!(
                payload_type,
                Some("function_call_output") | Some("custom_tool_call_output")
            )
        {
            let call = payload.get("call_id").and_then(Value::as_str).unwrap_or("");
            let output =
                text_value(payload.get("output").unwrap_or(&Value::Null)).unwrap_or_default();
            attach_result(&mut turns, call, &output, max_chars);
        }
        if include_outputs && row_type == Some("response_item") && payload_type == Some("reasoning")
        {
            let text =
                text_value(payload.get("summary").unwrap_or(&Value::Null)).unwrap_or_default();
            if !text.is_empty() {
                push_item(
                    &mut turns,
                    json!({"type":"reasoning","summary":[text]}),
                    index,
                )
            }
        }
    }
    turns
        .into_iter()
        .filter(|t| t["items"].as_array().is_some_and(|x| !x.is_empty()))
        .collect()
}

fn project_incremental(chunks: &[String], include_outputs: bool, max_chars: usize) -> Vec<Value> {
    let mut turns = Vec::<Value>::new();
    for (index, line) in chunks.iter().flat_map(|chunk| chunk.lines()).enumerate() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let row_type = v.get("type").and_then(Value::as_str);
        let payload = v.get("payload").unwrap_or(&Value::Null);
        let payload_type = payload.get("type").and_then(Value::as_str);
        if row_type == Some("response_item") && payload_type == Some("message") {
            for block in payload["content"].as_array().into_iter().flatten() {
                if matches!(block["type"].as_str(), Some("tool_result" | "tool-result")) && include_outputs {
                    let call = block["tool_use_id"].as_str().or_else(|| block["toolCallId"].as_str()).unwrap_or("");
                    attach_result(&mut turns, call, &tool_result_text(block), max_chars);
                }
            }
        }
        if row_type == Some("event_msg") && payload_type == Some("task_started") {
            turns.push(json!({"id":payload.get("turn_id").and_then(Value::as_str).unwrap_or("turn"),"items":[]}));
            continue;
        }
        let user = if row_type == Some("response_item")
            && payload_type == Some("message")
            && payload.get("role").and_then(Value::as_str) == Some("user")
        {
            text_value(&payload["content"])
        } else if row_type == Some("event_msg") && payload_type == Some("user_message") {
            payload
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        };
        if let Some(raw) = user {
            let Some(clean) = clean_user_text(&raw) else {
                continue;
            };
            // Codex records the same user input as both a response item and an event.
            // These are two representations of one turn, not two user messages.
            if turns.last().and_then(|t| t["items"].as_array()).is_some_and(|items| {
                items.last().is_some_and(|item| item["type"] == "userMessage"
                    && item.pointer("/content/0/text").and_then(Value::as_str) == Some(clean.as_str()))
            }) {
                continue;
            }
            if turns
                .last()
                .and_then(|t| t["items"].as_array())
                .is_none_or(|items| items.iter().any(|i| i["type"] == "userMessage"))
            {
                turns.push(json!({"id":format!("turn-{index}"),"items":[]}));
            }
            push_item(
                &mut turns,
                json!({"type":"userMessage","content":[{"type":"text","text":clean}]}),
                index,
            );
            continue;
        }
        if row_type == Some("response_item")
            && payload_type == Some("message")
            && payload.get("role").and_then(Value::as_str) == Some("assistant")
        {
            if let Some(text) = text_value(&payload["content"]) {
                push_item(
                    &mut turns,
                    json!({"type":"agentMessage","text":text,"phase":payload.get("phase")}),
                    index,
                )
            };
            continue;
        }
        if row_type == Some("event_msg") && payload_type == Some("agent_message") {
            if let Some(text) = payload.get("message").and_then(Value::as_str) {
                push_item(
                    &mut turns,
                    json!({"type":"agentMessage","text":text,"phase":payload.get("phase")}),
                    index,
                )
            };
            continue;
        }
        if row_type == Some("response_item")
            && matches!(
                payload_type,
                Some("function_call") | Some("custom_tool_call")
            )
        {
            let call = payload
                .get("call_id")
                .or_else(|| payload.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("call");
            let tool = payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let arguments = payload
                .get("arguments")
                .or_else(|| payload.get("input"))
                .cloned()
                .unwrap_or(Value::Null);
            let arguments = arguments
                .as_str()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or(arguments);
            let kind = if matches!(tool, "exec_command" | "shell" | "bash") {
                "commandExecution"
            } else {
                "mcpToolCall"
            };
            push_item(
                &mut turns,
                json!({"type":kind,"id":call,"server":"codex","tool":tool,"arguments":arguments,"status":"inProgress"}),
                index,
            );
            continue;
        }
        if include_outputs
            && row_type == Some("response_item")
            && matches!(
                payload_type,
                Some("function_call_output") | Some("custom_tool_call_output")
            )
        {
            let call = payload.get("call_id").and_then(Value::as_str).unwrap_or("");
            let output =
                text_value(payload.get("output").unwrap_or(&Value::Null)).unwrap_or_default();
            attach_result(&mut turns, call, &output, max_chars);
        }
        if include_outputs && row_type == Some("response_item") && payload_type == Some("reasoning")
        {
            let text =
                text_value(payload.get("summary").unwrap_or(&Value::Null)).unwrap_or_default();
            if !text.is_empty() {
                push_item(
                    &mut turns,
                    json!({"type":"reasoning","summary":[text]}),
                    index,
                )
            }
        }
    }
    turns
        .into_iter()
        .filter(|t| t["items"].as_array().is_some_and(|x| !x.is_empty()))
        .collect()
}

fn tool_result_text(block: &Value) -> String {
    block
        .pointer("/result/llmContent")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| text_value(block.get("content").unwrap_or(&Value::Null)))
        .unwrap_or_default()
}

fn push_item(turns: &mut Vec<Value>, item: Value, index: usize) {
    if turns.is_empty() {
        turns.push(json!({"id":format!("turn-{index}"),"items":[]}))
    }
    let items = turns.last_mut().unwrap()["items"]
        .as_array_mut()
        .unwrap();
    // Mirrored Codex agent_message/response_item records must not duplicate prose.
    if item["type"] == "agentMessage" && items.last().is_some_and(|last| last["type"] == "agentMessage" && last["text"] == item["text"]) { return; }
    items.push(item)
}
fn attach_result(turns: &mut [Value], call: &str, output: &str, max: usize) {
    for turn in turns.iter_mut().rev() {
        if let Some(items) = turn["items"].as_array_mut() {
            if let Some(item) = items
                .iter_mut()
                .rev()
                .find(|i| i["id"].as_str() == Some(call))
            {
                let (text, truncated) = truncate(output, max);
                item["status"] = json!("completed");
                item["result"] = json!({"text":text,"truncated":truncated,"originalChars":output.chars().count()});
                return;
            }
        }
    }
}
fn clean_user_text(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.starts_with("<environment_context>")
        || s.starts_with("<recommended_plugins>")
        || s.starts_with("<app-context>")
    {
        return None;
    }
    if let Some((_, request)) = s.rsplit_once("## My request for Codex:") {
        return Some(request.trim().into());
    }
    (!s.is_empty()).then(|| s.into())
}

fn extract_user_text(v: &Value) -> Option<String> {
    let role = v
        .pointer("/payload/role")
        .or_else(|| v.get("role"))
        .and_then(Value::as_str);
    if role == Some("user") || v.get("type").and_then(Value::as_str) == Some("user") {
        return text_value(
            v.pointer("/payload/content")
                .or_else(|| v.get("message"))
                .or_else(|| v.get("content"))?,
        );
    }
    None
}
fn text_value(v: &Value) -> Option<String> {
    // Tool protocol blocks are not conversational text, even when providers wrap
    // their results inside a user-role envelope. Dedicated adapters own them.
    if matches!(v.get("type").and_then(Value::as_str), Some("tool_use" | "tool_result" | "tool-result" | "function_call" | "function_call_output" | "custom_tool_call" | "custom_tool_call_output")) {
        return None;
    }
    if let Some(s) = v.as_str() {
        return Some(s.into());
    }
    if let Some(s) = v.get("text").and_then(Value::as_str) {
        return Some(s.into());
    }
    if let Some(content) = v.get("content") {
        return text_value(content);
    }
    let values = v
        .as_array()?
        .iter()
        .filter_map(|x| text_value(x))
        .collect::<Vec<_>>();
    (!values.is_empty()).then(|| values.join("\n"))
}
fn truncate(s: &str, max: usize) -> (String, bool) {
    if s.chars().count() <= max {
        return (s.into(), false);
    }
    (s.chars().take(max).collect(), true)
}

fn main() {
 let path = std::env::args().nth(1).unwrap();
 let mut input = std::io::BufReader::new(std::fs::File::open(path).unwrap());
 use std::io::BufRead;
 let mut chunks = Vec::new();
 for _ in 0..4 {
  let mut bytes = Vec::new();
  while bytes.len() < 8*1024*1024 { let n=input.read_until(b'\n', &mut bytes).unwrap(); if n==0 {break;} }
  chunks.push(String::from_utf8(bytes).unwrap());
 }
 let text = chunks.concat();
 for outputs in [false,true] {
  let baseline=project_codex(&text,outputs,4000);
  let resumed=project_incremental(&chunks,outputs,4000);
  assert_eq!(baseline,resumed);
  let naive: Vec<Value> = chunks.iter().flat_map(|s|project_codex(s,outputs,4000)).collect();
  println!("{}", json!({"sampleBytes":text.len(),"includeOutputs":outputs,"turns":baseline.len(),"statefulExactMatch":true,"independentChunkMatch":naive==baseline}));
 }
}
