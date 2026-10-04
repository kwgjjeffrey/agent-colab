import importlib.machinery
import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "bin" / "colab-canvas"
loader = importlib.machinery.SourceFileLoader("colab_canvas", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
canvas = importlib.util.module_from_spec(spec)
loader.exec_module(canvas)


class CanvasReferenceTests(unittest.TestCase):
    def test_nested_document_ref_round_trips(self):
        value = canvas.canvas_ref("1st channel", ["Plans", "2027", "Roadmap"])
        self.assertEqual(value, "colab://channel/1st%20channel/canvas/Plans/2027/Roadmap")
        self.assertEqual(canvas.parse_ref(value), ("1st channel", ["Plans", "2027", "Roadmap"]))

    def test_folder_paths_follow_parent_chain(self):
        rows = [
            {"id": "root", "name": "Plans", "parentFolderId": None},
            {"id": "child", "name": "2027", "parentFolderId": "root"},
        ]
        self.assertEqual(canvas.folder_paths(rows), {"root": ["Plans"], "child": ["Plans", "2027"]})


if __name__ == "__main__":
    unittest.main()
