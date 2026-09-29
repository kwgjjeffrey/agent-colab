import importlib.machinery
import importlib.util
import sys
import unittest
from pathlib import Path


def load_tool():
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "lib"))
    path = root / "bin" / "colab-skill-tool"
    loader = importlib.machinery.SourceFileLoader("colab_skill_tool", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class SkillToolResolutionTest(unittest.TestCase):
    def setUp(self):
        self.tool = load_tool()

    def test_readable_descendant_resolves_across_duplicate_channels(self):
        def request(method, path, **_kwargs):
            if path == "/v1/channels":
                return [{"id": "a", "name": "Team"}, {"id": "b", "name": "Team"}]
            if path == "/v1/channels/a/skills":
                return [{"id": "one", "name": "review"}]
            if path == "/v1/channels/b/skills":
                return [{"id": "two", "name": "deploy"}]
            raise AssertionError(path)
        self.tool.request = request
        self.assertEqual(self.tool.resolve("core", "colab://channel/Team/deploy")["id"], "two")

    def test_ambiguity_never_guesses(self):
        def request(method, path, **_kwargs):
            if path == "/v1/channels":
                return [{"id": "a", "name": "Team"}, {"id": "b", "name": "Team"}]
            return [{"id": path.split("/")[3], "name": "deploy", "contributorName": "Member"}]
        self.tool.request = request
        with self.assertRaises(self.tool.LocalApiError) as caught:
            self.tool.resolve("core", "colab://channel/Team/deploy")
        self.assertEqual(caught.exception.exit_code, 2)


if __name__ == "__main__":
    unittest.main()
