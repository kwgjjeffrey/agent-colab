import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import explorer

class ExplorerTests(unittest.TestCase):
    def test_encoded_segment_is_not_a_separator(self):
        ref = explorer.path_ref("Team", ["Design/Research", "Plan"])
        self.assertEqual(explorer.parse_ref(ref), ("Team", ["Design/Research", "Plan"]))

    def test_invalid_paths(self):
        for ref in ("https://channel/Team", "colab://channel/Team//Plan", "colab://channel/Team?q=x"):
            with self.assertRaises(ValueError): explorer.parse_ref(ref)

    def test_nested_resolution_preserves_consumer_identity(self):
        channel = {"id": "ch", "name": "Team"}
        catalog = {"id": "folder", "kind": "catalog", "name": "Design", "updatedAt": "today"}
        item = {"id": "session", "kind": "session", "name": "Plan", "updatedAt": "today"}
        def request(method, path, **kwargs):
            if path == "/v1/channels": return [channel]
            return [item] if "parentId=folder" in path else [catalog]
        with patch.object(explorer, "request", request):
            result = explorer.open_ref("core", "colab://channel/Team/Design/Plan")
        self.assertEqual(result["stableRef"], "colab://channel/ch/session")

    def test_direct_children_pagination(self):
        channel = {"id": "ch", "name": "Team"}
        rows = [{"id": str(i), "kind": "files", "name": str(i), "updatedAt": "today"} for i in range(3)]
        with patch.object(explorer, "resolve", return_value=(channel, None)), patch.object(explorer, "children", return_value=rows) as children:
            result = explorer.open_ref("core", "colab://channel/Team", 4, 2)
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["nextOffset"], 6)
        children.assert_called_once_with("core", "ch", None, 4, 3)
