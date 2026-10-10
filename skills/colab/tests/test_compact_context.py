import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from context_projection import references,context_tools

class CompactContextTests(unittest.TestCase):
    def test_compact_canvas_has_a_real_read_command(self):
        text='[@Progress](colab:canvas:550e8400-e29b-41d4-a716-446655440000)'
        rows=context_tools(text,'channel-id')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['name'],'Progress')
        self.assertIn('colab-canvas read --ref',rows[0]['readCommand'])
        self.assertIn('canvas/550e8400-e29b-41d4-a716-446655440000',rows[0]['readCommand'])
    def test_member_and_invalid_identity_are_not_resource_context(self):
        self.assertEqual(references('[@Member](colab:member:550e8400-e29b-41d4-a716-446655440000)'),[])
        self.assertEqual(references('[@Canvas](colab:canvas:not-an-id)'),[])
