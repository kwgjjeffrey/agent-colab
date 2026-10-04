use anyhow::Context;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::{
    io::{Read, Write},
    process::{Command, Stdio},
    time::Duration,
};
use wait_timeout::ChildExt;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update, updates::decoder::Decode};

// The codec is an owned Core helper, packaged beside colabd with its runtime. It receives
// document bytes only, never credentials, paths chosen by the caller, or executable commands.
fn invoke(doc: &Doc, operation: &str, old: &str, new: &str) -> anyhow::Result<serde_json::Value> {
    let dir = std::env::current_exe()?
        .parent()
        .context("missing Core executable directory")?
        .to_path_buf();
    let (node, script) = if dir.join("canvas-codec/codec.cjs").is_file() {
        (
            dir.join("canvas-codec/node"),
            dir.join("canvas-codec/codec.cjs"),
        )
    } else {
        let source =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../canvas-codec");
        (
            std::env::var_os("COLAB_CODEC_NODE")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| std::path::PathBuf::from("node")),
            source.join("dist/codec.cjs"),
        )
    };
    let state = doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    let input = serde_json::to_vec(
        &serde_json::json!({"operation":operation,"state":STANDARD.encode(state),"old":old,"new":new}),
    )?;
    let mut child = Command::new(node)
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .context("Canvas codec runtime unavailable")?;
    let mut stdin = child.stdin.take().context("codec stdin")?;
    let stdout = child.stdout.take().context("codec stdout")?;
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let reader = std::thread::spawn(move || {
        let mut data = Vec::new();
        stdout
            .take(32 * 1024 * 1024 + 1)
            .read_to_end(&mut data)
            .map(|_| data)
    });
    if child.wait_timeout(Duration::from_secs(15))?.is_none() {
        let _ = child.kill();
        let _ = child.wait();
        anyhow::bail!("Canvas codec timed out");
    }
    writer
        .join()
        .map_err(|_| anyhow::anyhow!("codec input thread failed"))??;
    let output = reader
        .join()
        .map_err(|_| anyhow::anyhow!("codec output thread failed"))??;
    anyhow::ensure!(output.len() <= 32 * 1024 * 1024, "codec output too large");
    let value: serde_json::Value = serde_json::from_slice(&output)?;
    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
        anyhow::bail!("{error}");
    }
    Ok(value)
}
pub(super) fn render(doc: &Doc) -> anyhow::Result<String> {
    Ok(invoke(doc, "render", "", "")?
        .get("content")
        .and_then(|v| v.as_str())
        .context("codec missing content")?
        .to_owned())
}
pub(super) fn patch(doc: &Doc, old: &str, new: &str) -> anyhow::Result<Vec<u8>> {
    let result = invoke(doc, "patch", old, new)?;
    let bytes = STANDARD.decode(
        result
            .get("update")
            .and_then(|v| v.as_str())
            .context("codec missing update")?,
    )?;
    // Apply only after the helper completed schema/identity validation; errors cannot mutate replica.
    doc.transact_mut()
        .apply_update(Update::decode_v1(&bytes)?)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framework_update_crosses_rust_bridge_and_replays() {
        let directory =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../canvas-codec");
        let seed = Command::new("node").current_dir(directory)
            .args(["--input-type=module", "-e", r#"
import {schema} from './codec.mjs';
import * as Y from 'yjs';
import {prosemirrorJSONToYDoc} from '@tiptap/y-tiptap';
const n={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Bridge context'}]}]};
console.log(Buffer.from(Y.encodeStateAsUpdate(prosemirrorJSONToYDoc(schema,n,'default'))).toString('base64'));
"#]).output().unwrap();
        assert!(seed.status.success());
        let bytes = STANDARD
            .decode(String::from_utf8(seed.stdout).unwrap().trim())
            .unwrap();
        let doc = Doc::new();
        doc.transact_mut()
            .apply_update(Update::decode_v1(&bytes).unwrap())
            .unwrap();
        assert_eq!(render(&doc).unwrap(), "Bridge context\n");
        let delta = patch(&doc, "Bridge context", "Bridge context\n\nAppended").unwrap();
        assert_eq!(render(&doc).unwrap(), "Bridge context\n\nAppended\n");
        let other = Doc::new();
        other
            .transact_mut()
            .apply_update(Update::decode_v1(&bytes).unwrap())
            .unwrap();
        other
            .transact_mut()
            .apply_update(Update::decode_v1(&delta).unwrap())
            .unwrap();
        other
            .transact_mut()
            .apply_update(Update::decode_v1(&delta).unwrap())
            .unwrap();
        assert_eq!(render(&other).unwrap(), render(&doc).unwrap());
        let before = render(&doc).unwrap();
        assert!(patch(&doc, "missing", "replacement").is_err());
        assert_eq!(render(&doc).unwrap(), before);
    }
}
