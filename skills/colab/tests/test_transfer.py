import http.server
import json
import os
import pathlib
import subprocess
import tempfile
import threading
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
COMMAND = ROOT / "bin" / "colab-transfer"


class Handler(http.server.BaseHTTPRequestHandler):
    requests = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))) or b"{}")
        self.requests.append((self.path, body, self.headers.get("authorization")))
        payload = {
            "/v1/transfers": {"transferId": "transfer-1", "capability": "agent-colab-transfer://transfer-1/token", "expiresAt": "tomorrow"},
            "/v1/transfers/receive": {"transferId": "transfer-1", "items": [{"kind": "files", "localPath": "/tmp/context", "tree": []}]},
            "/v1/transfers/revoke": None,
        }[self.path]
        raw = b"" if payload is None else json.dumps(payload).encode()
        self.send_response(204 if payload is None else 200)
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *_args):
        pass


class TransferCommandTest(unittest.TestCase):
    def setUp(self):
        Handler.requests = []
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.temporary = tempfile.TemporaryDirectory()
        discovery = pathlib.Path(self.temporary.name) / "discovery.json"
        discovery.write_text(json.dumps({"endpoint": f"http://127.0.0.1:{self.server.server_port}", "bearer": "local-secret"}))
        discovery.chmod(0o600)
        self.environment = {**os.environ, "COLAB_DISCOVERY_FILE": str(discovery)}

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temporary.cleanup()

    def run_command(self, *arguments):
        completed = subprocess.run([str(COMMAND), *arguments], env=self.environment, text=True, capture_output=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return json.loads(completed.stdout)

    def test_create_receive_and_revoke_use_local_core_contract(self):
        self.run_command("create", "--item", "files=~/context", "--item", "session=/tmp/thread.jsonl::codex-jsonl-v1")
        self.run_command("receive", "--capability", "agent-colab-transfer://transfer-1/token")
        self.run_command("revoke", "--transfer-id", "transfer-1")

        self.assertEqual([row[0] for row in Handler.requests], ["/v1/transfers", "/v1/transfers/receive", "/v1/transfers/revoke"])
        self.assertEqual(Handler.requests[0][1]["items"][0]["kind"], "files")
        self.assertEqual(Handler.requests[0][1]["items"][1]["sourceAdapter"], "codex-jsonl-v1")
        self.assertEqual(Handler.requests[1][1]["capability"], "agent-colab-transfer://transfer-1/token")
        self.assertTrue(all(row[2] == "Bearer local-secret" for row in Handler.requests))


if __name__ == "__main__":
    unittest.main()
