use anyhow::{bail, Context, Result};
use std::{env, fs, path::Path};
use yrs::{
    updates::decoder::Decode, Doc, GetString, OffsetKind, Options, ReadTxn, Text, Transact, Update,
    Xml, XmlFragment, XmlOut,
};

const OLD: &str = "Release validation is pending.";
const NEW: &str = "Release validation passed on macOS.";
const COMPONENT_PREFIX: &str = ":::colab-component{";

fn load(path: &Path) -> Result<Doc> {
    let bytes = fs::read(path).with_context(|| format!("read {}", path.display()))?;
    let doc = Doc::with_options(Options {
        offset_kind: OffsetKind::Utf16,
        ..Options::default()
    });
    doc.transact_mut()
        .apply_update(Update::decode_v1(&bytes).context("decode Yjs update v1")?)
        .context("apply Yjs fixture")?;
    Ok(doc)
}

fn inline_markdown(xml: &str) -> String {
    xml.replace("<bold>", "**")
        .replace("</bold>", "**")
        .replace("<italic>", "_")
        .replace("</italic>", "_")
        .replace("<code>", "`")
        .replace("</code>", "`")
}

fn plain_text(xml: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in xml.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn child_text<T: ReadTxn>(node: &XmlOut, txn: &T) -> String {
    match node {
        XmlOut::Text(text) => inline_markdown(&text.get_string(txn)),
        XmlOut::Element(element) => element
            .children(txn)
            .map(|child| child_text(&child, txn))
            .collect::<String>(),
        XmlOut::Fragment(fragment) => fragment
            .children(txn)
            .map(|child| child_text(&child, txn))
            .collect::<String>(),
    }
}

fn render_node<T: ReadTxn>(node: &XmlOut, txn: &T, indent: usize) -> Result<String> {
    let XmlOut::Element(element) = node else {
        return Ok(child_text(node, txn));
    };
    let tag = element.tag().as_ref();
    let body = child_text(node, txn);
    Ok(match tag {
        "heading" => {
            let level = element
                .get_attribute(txn, "level")
                .map(|value| value.to_string(txn))
                .unwrap_or_else(|| "1".into())
                .parse::<usize>()
                .unwrap_or(1)
                .clamp(1, 6);
            format!("{} {}\n\n", "#".repeat(level), body)
        }
        "paragraph" => format!("{}{}\n\n", " ".repeat(indent), body),
        "bulletList" => {
            let mut result = String::new();
            for child in element.children(txn) {
                let XmlOut::Element(item) = child else { continue };
                let item_body = item
                    .children(txn)
                    .map(|grandchild| child_text(&grandchild, txn))
                    .collect::<String>();
                result.push_str(&format!("{}- {}\n", " ".repeat(indent), item_body));
            }
            result.push('\n');
            result
        }
        "codeBlock" => {
            let language = element
                .get_attribute(txn, "language")
                .map(|value| value.to_string(txn))
                .unwrap_or_default();
            if language == "colab-component" && body.starts_with(COMPONENT_PREFIX) {
                format!("{}\n\n", body)
            } else {
                format!("```{}\n{}\n```\n\n", language, body)
            }
        }
        "listItem" => format!("{}- {}\n", " ".repeat(indent), body),
        other => bail!("unsupported Tiptap node: {other}"),
    })
}

fn render(doc: &Doc) -> Result<String> {
    let txn = doc.transact();
    let root = txn
        .get_xml_fragment("content")
        .context("missing content XmlFragment")?;
    let mut output = String::new();
    for node in root.children(&txn) {
        output.push_str(&render_node(&node, &txn, 0)?);
    }
    while output.ends_with("\n\n\n") {
        output.pop();
    }
    Ok(output)
}

fn patch_text(doc: &Doc, old: &str, new: &str) -> Result<Vec<u8>> {
    if old.contains(COMPONENT_PREFIX) || new.contains(COMPONENT_PREFIX) {
        bail!("structured_component_requires_tool");
    }
    let before = render(doc)?;
    if !before.contains(old) {
        bail!("patch_conflict: context not found");
    }
    let state_vector = doc.transact().state_vector();
    let mut txn = doc.transact_mut();
    let root = txn
        .get_xml_fragment("content")
        .context("missing content XmlFragment")?;
    let mut patched = false;
    for node in root.successors(&txn) {
        let XmlOut::Text(text) = node else { continue };
        let formatted = text.get_string(&txn);
        let plain = plain_text(&formatted);
        let Some(start) = plain.find(old) else { continue };
        text.remove_range(&mut txn, start as u32, old.encode_utf16().count() as u32);
        text.insert(&mut txn, start as u32, new);
        patched = true;
        break;
    }
    if !patched {
        bail!("patch_conflict: context crosses unsupported node boundaries");
    }
    drop(txn);
    Ok(doc.transact().encode_diff_v1(&state_vector))
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    match args.as_slice() {
        [_, command, input] if command == "render" => {
            print!("{}", render(&load(Path::new(input))?)?);
        }
        [_, command, input, output] if command == "patch" => {
            let doc = load(Path::new(input))?;
            let update = patch_text(&doc, OLD, NEW)?;
            fs::write(output, update)?;
            print!("{}", render(&doc)?);
        }
        [_, command, input] if command == "reject-component" => {
            let doc = load(Path::new(input))?;
            patch_text(
                &doc,
                ":::colab-component{type=\"queryList\" id=\"query_01\"}",
                ":::colab-component{type=\"queryList\" id=\"query_02\"}",
            )?;
        }
        _ => bail!("usage: f-canvas-01 render INPUT | patch INPUT OUTPUT | reject-component INPUT"),
    }
    Ok(())
}
