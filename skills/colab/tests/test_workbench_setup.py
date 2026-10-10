import contextlib
import importlib.machinery
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

loader = importlib.machinery.SourceFileLoader('workbench_setup', str(Path(__file__).parents[1] / 'setup/colab-setup'))
spec = importlib.util.spec_from_loader(loader.name, loader)
setup = importlib.util.module_from_spec(spec)
loader.exec_module(setup)

class WorkbenchSetupTests(unittest.TestCase):
    def run_update(self, root, corrupt=False):
        old = {'installed': True, 'version': 'old', 'componentVersions': {'local-core': 'core-old', 'desktop-ui': 'gui-old', 'colab-skill': 'skill-old', 'operation-workbench': 'wb-old'}, 'agents': ['codex']}
        (root/'installation.json').write_text(json.dumps(old))
        for name, version in old['componentVersions'].items():
            target=root/'versions'/name/version; target.mkdir(parents=True)
            (root/'current').mkdir(exist_ok=True)
            (root/'current'/name).symlink_to(target, target_is_directory=True)
        manifest={'version':'new','artifacts':[{'name':name,'version':version,'url':'https://example.test/'+name+'.zip','sha256':'test-digest','size':123} for name,version in {'local-core':'core-new','desktop-ui':'gui-new','colab-skill':'skill-new','operation-workbench':'wb-new'}.items()]}
        downloaded=[]
        def download(url, digest, size, archive):
            downloaded.append(url)
            with zipfile.ZipFile(archive,'w') as z:
                z.writestr('index.html','<title>Operation Workbench</title>')
                z.writestr('workbench.json',json.dumps({'package':'colab-operation-workbench','version':'wrong' if corrupt else 'wb-new'}))
        with patch.object(setup,'ROOT',root), patch.object(setup,'platform_id',return_value=('darwin','arm64')), patch.object(setup,'load_verified_manifest',return_value=manifest), patch.object(setup,'download',side_effect=download), patch.object(setup,'verify_core_readiness') as readiness, patch.object(setup,'install_launchd') as restart, patch.object(setup.sys,'argv',['colab-setup','update','--component','operation-workbench']), contextlib.redirect_stdout(io.StringIO()):
            if corrupt:
                with self.assertRaisesRegex(RuntimeError,'invalid Operation Workbench artifact'): setup.main()
            else: setup.main()
            readiness.assert_not_called(); restart.assert_not_called()
        self.assertEqual(downloaded,['https://example.test/operation-workbench.zip'])
        current=json.loads((root/'installation.json').read_text())
        for name in ('local-core','desktop-ui','colab-skill'):
            self.assertEqual(current['componentVersions'][name],old['componentVersions'][name])
            self.assertEqual((root/'current'/name).resolve().name,old['componentVersions'][name])
        self.assertEqual((root/'current/operation-workbench').resolve().name,'wb-old' if corrupt else 'wb-new')

    def test_selective_update_preserves_other_versions_and_resident_core(self):
        with tempfile.TemporaryDirectory() as d: self.run_update(Path(d))

    def test_invalid_frontend_preserves_active_workbench(self):
        with tempfile.TemporaryDirectory() as d: self.run_update(Path(d),corrupt=True)

    def test_legacy_manifest_remains_installable(self):
        manifest={'artifacts':[{'name':n,'version':'old'} for n in ('local-core','desktop-ui','colab-skill')]}
        with patch.object(setup,'platform_id',return_value=('darwin','arm64')):
            self.assertNotIn('operation-workbench',setup.select_artifacts(manifest))

if __name__=='__main__': unittest.main()
