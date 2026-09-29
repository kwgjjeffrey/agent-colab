import importlib.machinery
import importlib.util
import sys
import unittest
from pathlib import Path


def load_browser():
    skill_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(skill_root / "lib"))
    path = skill_root / "bin" / "colab-browser"
    loader = importlib.machinery.SourceFileLoader("colab_browser", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class ReadableResolutionTest(unittest.TestCase):
    def setUp(self):
        self.browser = load_browser()
        self.browser.channels = lambda _core: [
            {"id": "ch-a", "name": "Project", "createdAt": "2026-01-01", "role": "owner"},
            {"id": "ch-b", "name": "Project", "createdAt": "2026-02-01", "role": "member"},
        ]
        self.browser.sessions = lambda _core, _channel_id: []
        self.browser.skills = lambda _core, _channel_id: []

    def test_descendant_name_disambiguates_channel(self):
        self.browser.files = lambda _core, channel_id: ([
            {"id": "it-a", "name": "Design", "contributorName": "Zhang", "canWithdraw": True}
        ] if channel_id == "ch-a" else [
            {"id": "it-b", "name": "Research", "contributorName": "Li", "canWithdraw": False}
        ])
        result = self.browser.open_ref("unused", "colab://channel/Project/Research")
        self.assertEqual(result["id"], "it-b")

    def test_complete_ambiguity_returns_precise_candidates(self):
        self.browser.files = lambda _core, channel_id: [{
            "id": "it-" + channel_id,
            "name": "Design",
            "contributorName": "Zhang" if channel_id == "ch-a" else "Li",
            "updatedAt": "2026-03-01",
            "canWithdraw": False,
        }]
        with self.assertRaises(self.browser.AmbiguousReference) as caught:
            self.browser.open_ref("unused", "colab://channel/Project/Design")
        candidates = caught.exception.candidates
        self.assertEqual(len(candidates), 2)
        self.assertEqual(candidates[0]["preciseRef"], "colab://channel/ch-a/it-ch-a")

    def test_use_waits_for_refresh_and_returns_tree(self):
        self.browser.open_ref = lambda _core, _ref: {
            "id": "it-a", "kind": "item", "item_type": "files", "canWithdraw": False
        }
        calls = []
        def request(method, path, core):
            calls.append((method, path, core))
            if method == "POST":
                return {"id": "it-a", "localPath": "/tmp/shared"}
            return [{"path": "docs/readme.md", "name": "readme.md", "kind": "file", "size": 10}]
        self.browser.request = request
        result = self.browser.use_ref("core", "colab://channel/Project/Design")
        self.assertEqual(result["localPath"], "/tmp/shared")
        self.assertEqual(result["tree"][0]["path"], "docs/readme.md")
        self.assertEqual(calls[0][1], "/v1/files/it-a/materialize?wait=true")

    def test_session_share_resolves_catalog_id_before_mutation(self):
        self.browser.resolve_channel_ref = lambda _core, _ref: {"id": "ch-a", "name": "Project"}
        calls = []
        def request(method, path, **kwargs):
            calls.append((method, path, kwargs.get("body")))
            if method == "GET":
                return [{"id": "thread-1", "threadId": "thread-1", "name": "Plan", "sourcePath": "/tmp/one.jsonl", "sourceAdapter": "codex-jsonl-v1"}]
            return {"id": "share-1", "name": "Plan"}
        self.browser.request = request
        result = self.browser.share_item("core", "colab://channel/Project", "session", "thread-1", None)
        self.assertEqual(result["id"], "share-1")
        self.assertEqual(calls[1][2]["sourceAdapter"], "codex-jsonl-v1")

    def test_skill_share_accepts_catalog_source_id(self):
        self.browser.resolve_channel_ref = lambda _core, _ref: {"id": "ch-a", "name": "Project"}
        calls = []
        def request(method, path, **kwargs):
            calls.append((method, path, kwargs.get("body")))
            return {"id": "skill-1", "name": "Demo"}
        self.browser.request = request
        result = self.browser.share_item("core", "colab://channel/Project", "skill", "src_123", None)
        self.assertEqual(result["itemType"], "skill")
        self.assertEqual(calls[0][2], {"name": None, "sourceId": "src_123"})


if __name__ == "__main__":
    unittest.main()
