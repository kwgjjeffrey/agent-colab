#!/usr/bin/env python3
"""Black-box the write semantics of one Codex app-server owning multiple threads."""

from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODEL = ""


class AppServer:
    def __init__(self) -> None:
        self.process = subprocess.Popen(
            ["codex", "app-server"],
            cwd=ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self.lines: queue.Queue[dict] = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            try:
                self.lines.put(json.loads(line))
            except json.JSONDecodeError:
                pass

    def send(self, message: dict) -> None:
        assert self.process.stdin is not None
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()

    def wait_response(self, request_id: int, timeout: float = 60) -> tuple[dict, list[dict]]:
        deadline = time.monotonic() + timeout
        notifications: list[dict] = []
        while time.monotonic() < deadline:
            item = self.lines.get(timeout=max(0.1, deadline - time.monotonic()))
            if item.get("id") == request_id:
                return item, notifications
            notifications.append(item)
        raise TimeoutError(request_id)

    def collect_until_completions(self, count: int, timeout: float = 90) -> list[dict]:
        deadline = time.monotonic() + timeout
        events: list[dict] = []
        completions = 0
        while completions < count and time.monotonic() < deadline:
            try:
                item = self.lines.get(timeout=max(0.1, deadline - time.monotonic()))
            except queue.Empty:
                break
            events.append(item)
            if item.get("method") == "turn/completed":
                completions += 1
        return events

    def collect_for(self, timeout: float) -> list[dict]:
        deadline = time.monotonic() + timeout
        events: list[dict] = []
        while time.monotonic() < deadline:
            try:
                events.append(self.lines.get(timeout=max(0.1, deadline - time.monotonic())))
            except queue.Empty:
                break
        return events

    def close(self) -> None:
        self.process.terminate()
        self.process.wait(timeout=10)


def text_messages(events: list[dict]) -> list[str]:
    messages: list[str] = []
    for event in events:
        if event.get("method") != "item/completed":
            continue
        item = event.get("params", {}).get("item", {})
        if item.get("type") == "agentMessage":
            messages.append(item.get("text", ""))
    return messages


def start_thread(server: AppServer, request_id: int) -> str:
    server.send(
        {
            "id": request_id,
            "method": "thread/start",
            "params": {
                "cwd": str(ROOT),
                "model": MODEL,
                "ephemeral": False,
                "approvalPolicy": "never",
                "sandbox": "workspace-write",
                "developerInstructions": "Protocol black-box probe. Follow the exact response text requested.",
            },
        }
    )
    response, _ = server.wait_response(request_id)
    return response["result"]["thread"]["id"]


def start_slow_turn(server: AppServer, thread_id: str, request_id: int) -> str:
    server.send(
        {
            "id": request_id,
            "method": "turn/start",
            "params": {
                "threadId": thread_id,
                "model": MODEL,
                "clientUserMessageId": f"probe-{request_id}",
                "input": [
                    {
                        "type": "text",
                        "text": "Run `sleep 8` in the terminal, wait for it to finish, then reply exactly FIRST_DONE.",
                    }
                ],
                "sandboxPolicy": {
                    "type": "workspaceWrite",
                    "networkAccess": False,
                    "writableRoots": [str(ROOT)],
                },
            },
        }
    )
    response, _ = server.wait_response(request_id)
    return response["result"]["turn"]["id"]


def main() -> None:
    global MODEL
    server = AppServer()
    results: dict[str, object] = {}
    try:
        server.send(
            {
                "id": 1,
                "method": "initialize",
                "params": {
                    "clientInfo": {"name": "agent-colab-write-probe", "version": "1"},
                    "capabilities": {"experimentalApi": True},
                },
            }
        )
        results["initialize"] = server.wait_response(1)[0]
        server.send({"method": "initialized"})
        server.send(
            {
                "id": 2,
                "method": "model/list",
                "params": {"includeHidden": False, "limit": 100},
            }
        )
        model_response, _ = server.wait_response(2)
        models = model_response["result"]["data"]
        selected = next((model for model in models if model.get("isDefault")), models[0])
        MODEL = selected["model"]
        results["selected_model"] = {
            "id": selected["id"],
            "model": selected["model"],
            "displayName": selected["displayName"],
        }
        if os.environ.get("CODEX_PROBE_LIST_MODELS_ONLY") == "1":
            print(json.dumps({"selected": results["selected_model"], "models": models}, ensure_ascii=False, indent=2))
            return

        direct_thread = start_thread(server, 10)
        direct_active_turn = start_slow_turn(server, direct_thread, 11)
        server.send(
            {
                "id": 12,
                "method": "turn/start",
                "params": {
                    "threadId": direct_thread,
                    "clientUserMessageId": "probe-direct-second",
                    "input": [{"type": "text", "text": "Reply exactly SECOND_START."}],
                },
            }
        )
        direct_response, direct_pre_events = server.wait_response(12)
        server.send(
            {
                "id": 13,
                "method": "turn/interrupt",
                "params": {"threadId": direct_thread, "turnId": direct_active_turn},
            }
        )
        direct_interrupt, direct_interrupt_events = server.wait_response(13)
        direct_events = direct_pre_events + direct_interrupt_events + server.collect_for(3)
        results["direct_start_while_active"] = {
            "response": direct_response,
            "activeTurnId": direct_active_turn,
            "returnedSameTurn": direct_response.get("result", {}).get("turn", {}).get("id")
            == direct_active_turn,
            "interrupt": direct_interrupt,
            "completedTurns": sum(e.get("method") == "turn/completed" for e in direct_events),
            "messages": text_messages(direct_events),
        }

        queue_thread = start_thread(server, 20)
        queue_active_turn = start_slow_turn(server, queue_thread, 21)
        server.send(
            {
                "id": 22,
                "method": "thread/queue/add",
                "params": {
                    "threadId": queue_thread,
                    "clientUserMessageId": "probe-queued-second",
                    "input": [{"type": "text", "text": "Reply exactly QUEUED_DONE."}],
                },
            }
        )
        queue_response, queue_pre_events = server.wait_response(22)
        server.send(
            {
                "id": 23,
                "method": "turn/interrupt",
                "params": {"threadId": queue_thread, "turnId": queue_active_turn},
            }
        )
        queue_interrupt, queue_interrupt_events = server.wait_response(23)
        queue_events = queue_pre_events + queue_interrupt_events + server.collect_for(8)
        server.send(
            {
                "id": 24,
                "method": "thread/queue/list",
                "params": {"threadId": queue_thread},
            }
        )
        queue_list, queue_list_events = server.wait_response(24)
        queue_events += queue_list_events
        queued_submission_id = queue_response["result"]["queuedSubmission"]["id"]
        server.send(
            {
                "id": 25,
                "method": "thread/queue/start",
                "params": {
                    "threadId": queue_thread,
                    "queuedSubmissionId": queued_submission_id,
                },
            }
        )
        queue_start, queue_start_events = server.wait_response(25)
        queue_events += queue_start_events
        server.send(
            {
                "id": 26,
                "method": "thread/queue/list",
                "params": {"threadId": queue_thread},
            }
        )
        queue_after_start, queue_after_start_events = server.wait_response(26)
        queue_events += queue_after_start_events
        results["queue_add_while_active"] = {
            "response": queue_response,
            "interrupt": queue_interrupt,
            "queueAfterInterrupt": queue_list,
            "explicitQueueStart": queue_start,
            "queueAfterExplicitStart": queue_after_start,
            "completedTurns": sum(e.get("method") == "turn/completed" for e in queue_events),
            "turnStarts": [
                e.get("params", {}).get("turn", {}).get("id")
                for e in queue_events
                if e.get("method") == "turn/started"
            ],
            "messages": text_messages(queue_events),
        }

        idle_queue_thread = start_thread(server, 27)
        server.send(
            {
                "id": 28,
                "method": "thread/queue/add",
                "params": {
                    "threadId": idle_queue_thread,
                    "clientUserMessageId": "probe-idle-queued",
                    "input": [{"type": "text", "text": "Reply exactly IDLE_QUEUE_DONE."}],
                },
            }
        )
        idle_queue_add, _ = server.wait_response(28)
        idle_submission_id = idle_queue_add["result"]["queuedSubmission"]["id"]
        server.send(
            {
                "id": 29,
                "method": "thread/queue/start",
                "params": {
                    "threadId": idle_queue_thread,
                    "queuedSubmissionId": idle_submission_id,
                },
            }
        )
        idle_queue_start, idle_queue_start_events = server.wait_response(29)
        server.send(
            {
                "id": 34,
                "method": "thread/queue/list",
                "params": {"threadId": idle_queue_thread},
            }
        )
        idle_queue_after_start, _ = server.wait_response(34)
        results["explicit_queue_start_while_idle"] = {
            "add": idle_queue_add,
            "start": idle_queue_start,
            "turnStarts": [
                e.get("params", {}).get("turn", {}).get("id")
                for e in idle_queue_start_events
                if e.get("method") == "turn/started"
            ],
            "queueAfterStart": idle_queue_after_start,
        }

        steer_thread = start_thread(server, 30)
        active_turn = start_slow_turn(server, steer_thread, 31)
        server.send(
            {
                "id": 32,
                "method": "turn/steer",
                "params": {
                    "threadId": steer_thread,
                    "expectedTurnId": active_turn,
                    "clientUserMessageId": "probe-steer-second",
                    "input": [
                        {
                            "type": "text",
                            "text": "Also include the word STEERED in that same final reply.",
                        }
                    ],
                },
            }
        )
        steer_response, steer_pre_events = server.wait_response(32)
        server.send(
            {
                "id": 33,
                "method": "turn/interrupt",
                "params": {"threadId": steer_thread, "turnId": active_turn},
            }
        )
        steer_interrupt, steer_interrupt_events = server.wait_response(33)
        steer_events = steer_pre_events + steer_interrupt_events + server.collect_for(3)
        results["steer_while_active"] = {
            "response": steer_response,
            "activeTurnId": active_turn,
            "returnedSameTurn": steer_response.get("result", {}).get("turnId") == active_turn,
            "interrupt": steer_interrupt,
            "completedTurns": sum(e.get("method") == "turn/completed" for e in steer_events),
            "messages": text_messages(steer_events),
        }

        for request_id, thread_id in (
            (90, direct_thread),
            (91, queue_thread),
            (92, steer_thread),
            (93, idle_queue_thread),
        ):
            server.send(
                {
                    "id": request_id,
                    "method": "thread/unsubscribe",
                    "params": {"threadId": thread_id},
                }
            )
            results[f"unsubscribe_{thread_id}"] = server.wait_response(request_id)[0]
    finally:
        server.close()

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
