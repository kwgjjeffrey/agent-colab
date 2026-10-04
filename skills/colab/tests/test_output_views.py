import contextlib
import io
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from output_views import project, writer


class OutputViewsTests(unittest.TestCase):
    def test_every_operation_rejects_unrelated_top_level_fields(self):
        record = dict(id="id", name="Name", title="Title", ref="ref", seq=7,
                      body="first\nsecond", status="Done", state="installed", content="@capsule",
                      path="document.md", secret="MUST_NOT_LEAK", senderAvatarUrl="MUST_NOT_LEAK")
        cases = {
            "browser": {op: record for op in ["open", "use", "sync", "create-channel", "update-channel", "share", "withdraw", "add-member", "update-member", "remove-member"]},
            "canvas": {op: record for op in ["create", "read", "search", "apply-patch"]},
            "skill-tool": {op: record for op in ["install", "ensure", "update", "uninstall"]},
            "transfer": {op: record for op in ["create", "revoke"]},
        }
        cases["browser"].update({"members": [record], "session-sources": [record]})
        cases["canvas"]["list"] = {"folders": [record], "documents": [record]}
        cases["skill-tool"].update({"sources": [record], "status": {**record, "installations": [record]}, "check-update": {**record, "installations": [record]}})
        cases["transfer"]["receive"] = {"items": [record]}
        cases["session-reader"] = {"read": {"turns": [{"items": [record]}], "page": {"nextCursor": "cursor", "snapshot": "MUST_NOT_LEAK"}}}
        for tool, operations in cases.items():
            for operation, value in operations.items():
                with self.subTest(tool=tool, operation=operation):
                    args = SimpleNamespace(operation=operation, ref="ref", item="ref", offset=1, user="user", role="member")
                    self.assertNotIn("MUST_NOT_LEAK", json.dumps(project(tool, operation, value, args)))
        for group, operations in {"messages": ["list", "send"], "request": ["context", "reply"], "blueprint": ["list", "runtimes", "upsert", "remove", "select"]}.items():
            for operation in operations:
                value = [record] if operation in ("list", "context", "runtimes") else record
                with self.subTest(group=group, operation=operation):
                    args = SimpleNamespace(group=group, operation=operation)
                    self.assertNotIn("MUST_NOT_LEAK", json.dumps(project("messages", operation, value, args)))

    def test_pagination_and_content_are_preserved(self):
        args = SimpleNamespace(operation="read", offset=4)
        text = "# Heading\n@[Agent](colab://agent/id)\n"
        data, page = project("canvas", "read", {"content": text, "nextOffset": 9, "syncState": "saved_locally"}, args)
        self.assertEqual(data["content"], text)
        self.assertEqual(data["syncState"], "saved_locally")
        self.assertEqual(page, {"nextOffset": 9})

    def test_mutation_envelope_has_no_cursor_or_echo(self):
        args = SimpleNamespace(group="messages", operation="send")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            writer("messages", args)({"id": "message", "body": "echo", "content": {"internal": True}})
        self.assertEqual(json.loads(out.getvalue()), {"ok": True, "data": {"sent": True, "messageId": "message"}})

    def test_empty_member_ack_and_nullable_transfer_tree(self):
        args = SimpleNamespace(user="user", role="member")
        self.assertEqual(project("browser", "update-member", None, args)[0], {"updated": True, "user": "user", "role": "member"})
        value = {"items": [{"kind": "session", "tree": None, "localPath": "/tmp/session"}]}
        self.assertEqual(project("transfer", "receive", value, args)[0], {"items": [{"kind": "session", "localPath": "/tmp/session"}]})
