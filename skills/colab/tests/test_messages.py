import json
import os
import pathlib
import stat
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


COMMAND = pathlib.Path(__file__).resolve().parents[1] / "bin" / "colab-messages"


class Handler(BaseHTTPRequestHandler):
    blueprints = []
    requests = []

    def log_message(self, *_args):
        pass

    def send_json(self, status, value=None):
        raw = b"" if value is None else json.dumps(value).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/v1/channels/channel-1/messages/b9b0bf8c-98e7-48db-9a88-4fb5926d51af":
            return self.send_json(200, {"id":"b9b0bf8c-98e7-48db-9a88-4fb5926d51af","channelId":"channel-1","seq":42,"body":"Read Design","senderAvatarUrl":"private-avatar","content":{"type":"doc","content":[{"type":"mention","attrs":{"kind":"files","id":"a9b0bf8c-98e7-48db-9a88-4fb5926d51af","label":"Design"}}]}})
        if self.path == "/v1/channels":
            return self.send_json(200, [{"id": "channel-1", "name": "Design"}])
        if self.path.startswith("/v1/channels/channel-1/messages"):
            return self.send_json(200, [{"id": "message-1", "seq": 1, "body": "hello"}])
        if self.path.startswith("/v1/channels/channel-1/blueprints"):
            return self.send_json(200, self.blueprints)
        if self.path == "/v1/channels/channel-1/agent-runtimes":
            return self.send_json(200, [{"id": "runtime-1", "deviceName": "Test Mac", "provider": "codex", "available": True}])
        if self.path.startswith("/v1/agent-requests/request-1/context"):
            return self.send_json(200, [{"id":"message-0","seq":0,"body":"earlier"}])
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))) or b"{}")
        self.requests.append(("POST", self.path, body))
        if self.path.endswith("/messages"):
            return self.send_json(201, {"id": "message-2", "seq": 2, "body": body["body"]})
        if self.path.endswith("/blueprints"):
            created = {"id": "agent-1", "name": body["name"], "inChannel": False, **body}
            self.blueprints.append(created)
            return self.send_json(201, created)
        if self.path.endswith("/reply"):
            return self.send_json(201, {"id":"message-3","body":body["message"]})
        self.send_json(404, {"error": "not found"})

    def do_PATCH(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))) or b"{}")
        self.requests.append(("PATCH", self.path, body))
        if self.path.endswith("/selection"):
            return self.send_json(204)
        updated = {**self.blueprints[0], **body}
        self.blueprints[0] = updated
        self.send_json(200, updated)


class MessagesCliTests(unittest.TestCase):
    def setUp(self):
        Handler.blueprints = []
        Handler.requests = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.temporary = tempfile.TemporaryDirectory()
        self.discovery = pathlib.Path(self.temporary.name) / "discovery.json"
        self.discovery.write_text(json.dumps({"endpoint": f"http://127.0.0.1:{self.server.server_port}", "bearer": "test"}))
        self.discovery.chmod(stat.S_IRUSR | stat.S_IWUSR)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temporary.cleanup()

    def run_cli(self, *args):
        result = subprocess.run(
            [str(COMMAND), *args],
            env={**os.environ, "COLAB_DISCOVERY_FILE": str(self.discovery)},
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        return json.loads(result.stdout)["data"]

    def run_cli_failure(self, *args):
        result = subprocess.run(
            [str(COMMAND), *args],
            env={**os.environ, "COLAB_DISCOVERY_FILE": str(self.discovery)},
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
        )
        self.assertNotEqual(result.returncode, 0)
        return result

    def test_messages_list_and_send_use_local_core(self):
        self.assertEqual(self.run_cli("messages", "list", "--channel", "Design")[0]["seq"], 1)
        sent = self.run_cli("messages", "send", "--channel", "Design", "--body", "from skill")
        self.assertEqual(sent, {"sent": True, "messageId": "message-2"})
        self.assertTrue(Handler.requests[-1][2]["clientNonce"])

    def test_exact_message_read_returns_context_tools_not_renderer_internals(self):
        row = self.run_cli("messages", "read", "--channel", "Design", "--id", "b9b0bf8c-98e7-48db-9a88-4fb5926d51af")
        self.assertEqual(row["seq"], 42)
        self.assertNotIn("content", row)
        self.assertNotIn("senderAvatarUrl", row)
        self.assertIn("files:a9b0bf8c", row["body"])
        self.assertIn("colab-browser use --ref", row["context"][0]["readCommand"])

    def test_blueprint_upsert_then_select(self):
        created = self.run_cli("blueprint", "upsert", "--channel", "Design", "--name", "Release Agent", "--runtime", "runtime-1")
        self.assertEqual(created["name"], "Release Agent")
        self.assertEqual(created, {"saved": True, "id": "agent-1", "name": "Release Agent"})
        selected = self.run_cli("blueprint", "select", "--channel", "Design", "--name", "Release Agent", "--enabled", "true")
        self.assertTrue(selected["inChannel"])
        self.assertEqual(Handler.requests[-1][2], {"enabled": True})

    def test_blueprint_upsert_requires_a_registered_runtime(self):
        result = self.run_cli_failure(
            "blueprint", "upsert", "--channel", "Design", "--name", "No Runtime"
        )
        self.assertIn("--runtime", result.stderr)

    def test_request_context_and_reply_are_request_scoped(self):
        rows = self.run_cli("request", "context", "--request", "request-1", "--before", "10")
        self.assertEqual(rows[0]["body"], "earlier")
        reply = self.run_cli("request", "reply", "--request", "request-1", "--message", "done")
        self.assertEqual(reply, {"sent": True, "messageId": "message-3"})


if __name__ == "__main__":
    unittest.main()
