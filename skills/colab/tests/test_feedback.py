import importlib.machinery
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'lib'))
from feedback_hooks import configure_hooks
loader = importlib.machinery.SourceFileLoader('feedback_command',str(ROOT/'bin/colab-feedback'))
spec = importlib.util.spec_from_loader(loader.name,loader)
command = importlib.util.module_from_spec(spec)
loader.exec_module(command)
class FeedbackTests(unittest.TestCase):
    def test_hooks_preserve_other_owners_and_remove_only_colab(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'hooks.json'
            original={'hooks':{'Stop':[{'_owner':'other','hooks':[{'command':'keep'}]}]},'extra':'retain'}
            path.write_text(json.dumps(original))
            configure_hooks(True,path=path,command='test')
            configure_hooks(True,path=path,command='test')
            self.assertEqual(len(json.loads(path.read_text())['hooks']['Stop']),2)
            configure_hooks(False,path=path)
            result=json.loads(path.read_text())
            self.assertEqual(result['hooks']['Stop'],original['hooks']['Stop'])
            self.assertEqual(result['extra'],'retain')
    def test_enable_requires_explicit_upload_consent(self):
        with patch.object(sys,'argv',['colab-feedback','configure','--enable']),patch.object(command,'request') as request,patch.object(command,'failure',return_value=2):
            self.assertEqual(command.main(),2)
            request.assert_not_called()
    def test_status_requires_revision_for_each_id(self):
        with patch.object(sys,'argv',['colab-feedback','update-feedback-status','--asset-key','asset:one','--feedback-id','one','--status','resolved','--reason','verified','--expected-revision','two=0']),patch.object(command,'request') as request,patch.object(command,'failure',return_value=2):
            self.assertEqual(command.main(),2)
            request.assert_not_called()
if __name__=='__main__':unittest.main()
