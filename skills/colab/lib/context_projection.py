"""Presentation of product references; no transport, credentials or CRDT interpretation."""
import base64
import json
import re
import shlex
import sys
import uuid
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

KINDS = {"files", "session", "skill", "canvas", "message"}

def references(content):
    found = []
    def visit(node):
        if not isinstance(node, dict):
            return
        attrs = node.get("attrs", {})
        if node.get("type") == "mention" and attrs.get("kind") in KINDS:
            found.append(attrs)
        for child in node.get("content", []):
            visit(child)
    if isinstance(content, dict):
        visit(content)
    elif isinstance(content, str):
        for label,kind,identity in re.findall(r"\[@((?:\\.|[^\]])*)\]\(colab:([^:()]+):([^()]+)\)", content):
            kind = unquote(kind)
            if kind in KINDS:
                found.append({"kind": kind, "id": unquote(identity), "label": re.sub(r"\\(.)", r"\1", label)})
        for payload in re.findall(r"\(colab-(?:mention:|resource:(?:files|session|canvas|message):[A-Za-z0-9-]+:)([A-Za-z0-9_-]+)\)", content):
            try:
                attrs = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
                if attrs.get("kind") in KINDS:
                    found.append(attrs)
            except (ValueError, TypeError, AttributeError):
                continue
    result = {}
    for attrs in found:
        try:
            identity = str(uuid.UUID(attrs["id"]))
        except (ValueError, KeyError, TypeError, AttributeError):
            continue
        result[(attrs["kind"], identity)] = {"kind": attrs["kind"], "id": identity, "name": str(attrs.get("label", identity))}
    return list(result.values())

def context_tools(content, channel):
    root = Path(sys.argv[0]).absolute().parent
    result = []
    for row in references(content):
        kind, identity = row["kind"], row["id"]
        ref = f"colab://channel/{quote(channel, safe='')}/{'canvas/' if kind == 'canvas' else ''}{identity}"
        if kind == "message":
            command = f"{shlex.quote(str(root / 'colab-messages'))} messages read --channel {shlex.quote(channel)} --id {shlex.quote(identity)}"
        else:
            tool = {"files": "colab-browser", "session": "colab-session-reader", "skill": "colab-skill-tool", "canvas": "colab-canvas"}[kind]
            action = "use" if kind == "files" else "status" if kind == "skill" else "read"
            command = f"{shlex.quote(str(root / tool))} {action} --ref {shlex.quote(ref)}"
            if kind == "session":
                command += " --turn-limit 20 --include-outputs --max-output-chars-per-item 4000"
        result.append({**row, "readCommand": command})
    return result

def message_text(node):
    if node.get("type") == "text":
        return node.get("text", "")
    if node.get("type") == "mention":
        attrs = node.get("attrs", {})
        return f"[{attrs.get('label', 'Context')} · {attrs['kind']}:{attrs.get('id', '')}]" if attrs.get("kind") in KINDS else "@" + str(attrs.get("label", "Member"))
    if node.get("type") == "hardBreak":
        return "\n"
    return "".join(message_text(child) for child in node.get("content", [])) + ("\n" if node.get("type") == "paragraph" else "")

def project_message(value):
    fields = "id seq senderName senderKind body replyToMessageId createdAt".split()
    row = {key: value[key] for key in fields if value.get(key) is not None}
    content = value.get("content")
    if isinstance(content, dict) and references(content):
        row["body"] = message_text(content).rstrip()
        row["context"] = context_tools(content, value.get("channelId", ""))
    return row

def canvas_context(content, ref):
    parts = urlparse(ref).path.split("/")
    return context_tools(content, unquote(parts[1]) if len(parts) > 1 else "")
