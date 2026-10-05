#!/usr/bin/env python3
"""Exercise installed Core account switching and each owner's real runtime.

No credentials are printed and the original foreground account is restored.
The two visible test messages are intentional end-to-end acceptance records.
"""
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
try:
    for email in (live.OWNER_EMAIL, live.CONSUMER_EMAIL):
        live.switch(email)
        status = request("GET", "/v1/auth/status")
        assert status["user"]["email"] == email
        channel_name = "demo" if email == live.OWNER_EMAIL else "1st channel"
        channel = next(c for c in request("GET", "/v1/channels") if c["name"] == channel_name)
        base = f"/v1/channels/{channel['id']}"
        agents = [a for a in request("GET", base + "/blueprints") if a["editable"] and a["inChannel"]]
        assert len(agents) == 1, [(a["name"], a["id"]) for a in agents]
        agent = agents[0]
        runtimes = request("GET", base + "/agent-runtimes")
        target = next(r for r in runtimes if r["id"] == agent["runtimeId"])
        assert target["deviceName"] != "Trace acceptance isolated Core", target["deviceName"]
        marker = "ACCOUNT_RUNTIME_OK_" + uuid.uuid4().hex[:8]
        query = f"Account-switch acceptance check. Reply through the Colab request reply tool with exactly {marker}. Do not modify files."
        sent = request("POST", base + "/messages", {
            "plainText": f"@{agent['name']} {query}", "clientNonce": str(uuid.uuid4()),
            "content": {"type": "doc", "content": [{"type": "paragraph", "content": [
                {"type": "mention", "attrs": {"id": agent["id"], "kind": "agent", "label": agent["name"]}},
                {"type": "text", "text": " " + query},
            ]}]},
        })
        print(f"sent {email}: {sent['id']} target={target['deviceName']}", flush=True)
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            messages = request("GET", base + f"/messages?after={sent['seq']}&limit=100")
            rows = messages if isinstance(messages, list) else messages.get("items", messages.get("messages", []))
            replies = [m for m in rows if m.get("replyToMessageId") == sent["id"]]
            assert not any("offline at the moment" in m.get("body", "") for m in replies), replies
            if any(marker in m.get("body", "") for m in replies):
                print(f"PASS {email}: runtime replied {marker}", flush=True)
                break
            time.sleep(3)
        else:
            raise AssertionError(f"No runtime reply within 240 seconds: {email}")
finally:
    request("POST", "/v1/auth/switch", {"userId": original})
    print("Original foreground account restored", flush=True)
