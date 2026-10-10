import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("artifact_config", ROOT / "packaging/artifact-config.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SkillRenderingTests(unittest.TestCase):
    def test_names_are_driven_by_configuration_for_any_distribution(self):
        base = module.load_config(ROOT / "packaging/artifact-config.example.json")
        for name, title in [("agent-colab", "Agent Colab"), ("kwai-colab", "Kwai Colab"), ("another-company", "Another Company")]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                config = json.loads(json.dumps(base))
                config['skill'].update(name=name, displayName=title, defaultPrompt=f"Use ${name} for collaboration.")
                output = Path(directory)
                module.render_skill(ROOT, config, output)
                markdown = (output / 'SKILL.md').read_text()
                metadata = (output / 'agents/openai.yaml').read_text()
                self.assertIn(f"name: {name}", markdown)
                self.assertIn(f"# {title}", markdown)
                self.assertIn(f"display_name: {json.dumps(title)}", metadata)
                self.assertIn(f"${name}", metadata)
                self.assertNotIn('@COLAB_SKILL_', markdown + metadata)
                self.assertEqual(json.loads((output / 'artifact-config.json').read_text())['skill']['name'], name)

    def test_enterprise_derivation_uses_frozen_templates(self):
        config = module.load_config(ROOT / 'packaging/artifact-config.example.json')
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / 'public'
            module.render_skill(ROOT, config, original)
            frozen = original / '.artifact-templates'
            template = frozen / 'SKILL.md.in'
            template.write_text(template.read_text() + '\nFrozen source marker\n')
            config['skill'].update(name='company-colab',displayName='Company Colab',defaultPrompt='Use $company-colab.')
            output = Path(directory) / 'enterprise'
            module.render_skill(ROOT, config, output, frozen)
            self.assertIn('Frozen source marker', (output / 'SKILL.md').read_text())
            self.assertIn('name: company-colab', (output / 'SKILL.md').read_text())

    def test_bootstrap_and_runtime_identity_follow_the_same_target_config(self):
        import shutil, subprocess, sys
        base = module.load_config(ROOT / 'packaging/artifact-config.example.json')
        for name, bundle in [('agent-colab', 'Colab.app'), ('company-colab', 'Company.app')]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                config = json.loads(json.dumps(base))
                config['skill'].update(name=name, defaultPrompt=f'Use ${name}.')
                config['application'].update(appBundleName=bundle,serviceLabel=f'online.{name}.core',windowsTaskName=name+'Core')
                root = Path(directory)
                bootstrap = root / 'bootstrap'
                module.render(ROOT,config,bootstrap)
                text = (bootstrap / 'colab-install').read_text()
                self.assertNotIn('@COLAB_',text)
                self.assertIn('/Applications/'+bundle,text)
                self.assertIn('skills/'+name+'/setup',text)
                installed = root / 'skill'
                shutil.copytree(ROOT / 'skills/colab',installed)
                module.render_skill(ROOT,config,installed)
                code = 'import runpy,json; v=runpy.run_path('+repr(str(installed/'setup/colab-setup'))+'); print(json.dumps([v["SERVICE_LABEL"],v["APP_BUNDLE"],v["WINDOWS_TASK"]]))'
                actual = json.loads(subprocess.check_output([sys.executable,'-c',code],text=True))
                self.assertEqual(actual,[f'online.{name}.core',bundle,name+'Core'])

    def test_unsafe_skill_names_are_rejected(self):
        config = module.load_config(ROOT / 'packaging/artifact-config.example.json')
        config['skill']['name'] = '../other'
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'config.json'
            file.write_text(json.dumps(config))
            with self.assertRaises(ValueError):
                module.load_config(file)

if __name__ == '__main__': unittest.main()
