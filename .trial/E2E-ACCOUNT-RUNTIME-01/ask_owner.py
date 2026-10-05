#!/usr/bin/env python3
"""Verify refusal followed by an independent owner instruction on installed Core."""
import importlib.util
from pathlib import Path
import time
import uuid

source = Path(__file__).resolve().parents[1] / "E2E-AGENT-TOOLS-01/live_cross_account.py"
spec = importlib.util.spec_from_file_location("live", source)
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)
request = live.local_request
original = request("GET", "/v1/auth/status")["user"]["id"]
channel = "9be4ca3e-17ce-441a-aa7d-4413eb973a1b"
base = f"/v1/channels/{channel}"
agent_id = "be1d356b-312f-425b-978f-d4bfe482be80"

def send(agent, query, reply=None):
    return request("POST", base + "/messages", {
        "plainText": f"@{agent['name']} {query}", "clientNonce": str(uuid.uuid4()),
        "replyToMessageId": reply,
        "content": {"type": "doc", "content": [{"type": "paragraph", "content": [
            {"type": "mention", "attrs": {"id": agent_id, "kind": "agent", "label": agent["name"]}},
            {"type": "text", "text": " " + query},
        ]}]},
    })

try:
    live.switch(live.OWNER_EMAIL)
    agent = next(a for a in request("GET", base + "/blueprints") if a["id"] == agent_id)
    assert agent["invocationPolicy"] == "awaiting_owner"
    live.switch(live.CONSUMER_EMAIL)
    marker = "ASK_OWNER_NEW_" + uuid.uuid4().hex[:8]
    old = send(agent, "Acceptance test: do not modify files. Owner will send a separate instruction.")
    commands = request("GET", base + "/agent-requests")
    rejected = next(c for c in commands if c.get("triggerMessageId") == old["id"])
    assert rejected["state"] == "rejected", rejected["state"]
    rows = request("GET", base + f"/messages?after={old['seq']}&limit=100")
    guide = next(m for m in rows if m.get("replyToMessageId") == old["id"])
    assert "please reply and @mention me" in guide["body"]
    live.switch(live.OWNER_EMAIL)
    new = send(agent, f"Additional owner instruction: reply through the Colab request reply tool with exactly {marker}. Do not modify files.", guide["id"])
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        commands = request("GET", base + "/agent-requests")
        current = next(c for c in commands if c.get("triggerMessageId") == new["id"])
        assert current["id"] != rejected["id"]
        assert next(c for c in commands if c["id"] == rejected["id"])["state"] == "rejected"
        assert current["state"] not in ("failed", "rejected")
        rows = request("GET", base + f"/messages?after={new['seq']}&limit=100")
        if current["state"] == "succeeded" and any(m.get("replyToMessageId") == new["id"] and marker in m["body"] for m in rows):
            print(f"PASS rejected={rejected['id']} new={current['id']} reply={marker}", flush=True)
            break
        time.sleep(3)
    else:
        raise AssertionError("Owner's independent command did not complete")
finally:
    request("POST", "/v1/auth/switch", {"userId": original})
    print("Original account restored", flush=True)
