#!/usr/bin/env python3
"""Black-box Agent CLI validation against two saved real Google accounts.

This test deliberately executes the installed commands, not source modules. It creates
uniquely named temporary shares, consumes them as the other account, and withdraws them
as the contributor. Credentials remain owned by Local Core and are never printed.
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid


OWNER_EMAIL = os.environ.get("COLAB_E2E_OWNER", "yuzhyuan@gmail.com")
CONSUMER_EMAIL = os.environ.get("COLAB_E2E_CONSUMER", "jeffreyyuzhyuan@gmail.com")
CHANNEL_NAME = os.environ.get("COLAB_E2E_CHANNEL", "second channel")
SKILL_ROOT = pathlib.Path(os.environ.get("COLAB_SKILL_ROOT", pathlib.Path.home() / ".agents/skills/agent-colab"))
BROWSER = SKILL_ROOT / "bin/colab-browser"
READER = SKILL_ROOT / "bin/colab-session-reader"
SKILL_TOOL = SKILL_ROOT / "bin/colab-skill-tool"


def discovery_path() -> pathlib.Path:
    if value := os.environ.get("COLAB_DISCOVERY_FILE"):
        return pathlib.Path(value)
    if sys.platform == "win32":
        return pathlib.Path(os.environ["LOCALAPPDATA"]) / "AgentColab/discovery.json"
    return pathlib.Path.home() / ".local/share/agent-colab/discovery.json"


def local_request(method: str, path: str, body=None):
    discovery = json.loads(discovery_path().read_text())
    payload = None if body is None else json.dumps(body).encode()
    headers = {"authorization": f"Bearer {discovery['bearer']}"}
    if payload is not None:
        headers["content-type"] = "application/json"
    request = urllib.request.Request(discovery["endpoint"] + path, data=payload, headers=headers, method=method)
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=60) as response:
        raw = response.read()
    return json.loads(raw) if raw else None


def command(executable: pathlib.Path, *arguments: str, expect_ok: bool = True):
    result = subprocess.run(
        [str(executable), *arguments], text=True, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=900,
    )
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise AssertionError(f"{executable.name} returned non-JSON: {result.stderr or result.stdout}") from error
    if expect_ok and (result.returncode or not value.get("ok")):
        raise AssertionError(f"{executable.name} failed: {value}")
    return value


def switch(email: str):
    accounts = local_request("GET", "/v1/auth/accounts")
    matches = [account for account in accounts if account["email"].casefold() == email.casefold()]
    if len(matches) != 1:
        raise AssertionError(f"Expected one saved account for {email}; found {len(matches)}")
    local_request("POST", "/v1/auth/switch", {"userId": matches[0]["userId"]})


def channel_ref() -> str:
    from urllib.parse import quote
    return f"colab://channel/{quote(CHANNEL_NAME, safe='')}"


def smallest_session_source():
    rows = command(BROWSER, "session-sources", "--query", "", "--limit", "500")["data"]
    available = []
    for row in rows:
        try:
            size = pathlib.Path(row["sourcePath"]).stat().st_size
        except OSError:
            continue
        title = row.get("name", "").lstrip()
        # Tiny metadata-only transcripts can be syntactically valid yet project to no user turns.
        # Pick the smallest ordinary conversation so the test proves content visibility as well
        # as transport, without making a huge historical Session part of every smoke run.
        if (
            size >= 10 * 1024
            and row.get("sourceAdapter")
            and not title.startswith(("rollout-", "<system-reminder>", "[agent-memory:"))
        ):
            available.append((size, row))
    if not available:
        raise AssertionError("No readable indexed Session source is available")
    return min(available, key=lambda pair: pair[0])[1]


def wait_for_session(ref: str):
    deadline = time.monotonic() + 180
    last = None
    while time.monotonic() < deadline:
        last = command(READER, "read", "--ref", ref, "--turn-limit", "2", expect_ok=False)
        if last.get("ok"):
            return last
        time.sleep(2)
    raise AssertionError(f"Session did not become consumable: {last}")


def main():
    suffix = uuid.uuid4().hex[:10]
    names = {kind: f"e2e-{kind}-{suffix}" for kind in ("files", "session", "skill")}
    refs = {}
    report = {"owner": OWNER_EMAIL, "consumer": CONSUMER_EMAIL, "channel": CHANNEL_NAME, "checks": []}
    temporary = tempfile.mkdtemp(prefix="agent-colab-e2e-")
    try:
        root = pathlib.Path(temporary)
        file_source = root / "shared.txt"
        file_source.write_text(f"agent-colab-e2e:{suffix}\n")
        skill_source = root / names["skill"]
        skill_source.mkdir()
        (skill_source / "SKILL.md").write_text(
            f"---\nname: {names['skill']}\ndescription: Agent Colab cross-account test fixture.\n---\n\n# Fixture\n"
        )

        switch(OWNER_EMAIL)
        session_source = smallest_session_source()
        for kind, source in (
            ("files", str(file_source)),
            ("session", session_source["id"]),
            ("skill", str(skill_source)),
        ):
            shared = command(
                BROWSER, "share", "--channel", channel_ref(), "--item-type", kind,
                "--source", source, "--name", names[kind],
            )["data"]
            refs[kind] = shared["ref"]
        report["checks"].append("owner_shared_files_session_skill")

        switch(CONSUMER_EMAIL)
        listed = command(BROWSER, "open", "--ref", channel_ref())["data"]
        visible = {row["name"] for row in listed}
        if not set(names.values()).issubset(visible):
            raise AssertionError(f"Consumer cannot see all shares: {set(names.values()) - visible}")
        report["checks"].append("consumer_listed_all_three_items")

        used = command(BROWSER, "use", "--ref", refs["files"])["data"]
        materialized = pathlib.Path(used["localPath"])
        content_path = materialized if materialized.is_file() else materialized / file_source.name
        if content_path.read_text() != file_source.read_text():
            raise AssertionError("Consumer Files materialization differs from contributor source")
        report["checks"].append("consumer_materialized_files")

        session = wait_for_session(refs["session"])["data"]
        if not session.get("turns") or not session.get("snapshot", {}).get("id"):
            raise AssertionError("Consumer Session read omitted turns or snapshot")
        report["checks"].append("consumer_read_session")

        installed = command(SKILL_TOOL, "ensure", "--ref", refs["skill"], "--target", "myflicker")["data"]
        if installed.get("state") not in {"installed", "current"}:
            raise AssertionError(f"Unexpected Skill installation state: {installed}")
        command(SKILL_TOOL, "uninstall", "--ref", refs["skill"], "--target", "myflicker")
        report["checks"].append("consumer_installed_and_uninstalled_skill")
    finally:
        try:
            switch(OWNER_EMAIL)
            for ref in refs.values():
                command(BROWSER, "withdraw", "--item", ref, expect_ok=False)
        finally:
            shutil.rmtree(temporary, ignore_errors=True)
    report["checks"].append("owner_withdrew_test_items")
    print(json.dumps({"ok": True, "data": report}, indent=2))


if __name__ == "__main__":
    main()
