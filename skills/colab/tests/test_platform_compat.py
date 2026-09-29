import importlib.machinery
import importlib.util
import pathlib
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.platform_paths import application_root, platform_id


def load_setup():
    loader = importlib.machinery.SourceFileLoader("colab_setup_test", str(ROOT / "setup/colab-setup"))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class PlatformCompatibilityTests(unittest.TestCase):
    def test_windows_application_root_uses_local_app_data(self):
        with mock.patch("lib.platform_paths.sys.platform", "win32"), mock.patch.dict(
            "lib.platform_paths.os.environ", {"LOCALAPPDATA": r"C:\\Users\\test\\AppData\\Local"}, clear=True
        ):
            self.assertEqual(application_root(), pathlib.Path(r"C:\\Users\\test\\AppData\\Local") / "AgentColab")

    def test_windows_platform_identifier_normalizes_amd64(self):
        with mock.patch("lib.platform_paths.sys.platform", "win32"), mock.patch(
            "lib.platform_paths.platform.machine", return_value="AMD64"
        ):
            self.assertEqual(platform_id(), ("windows", "x86_64"))

    def test_manifest_selects_only_current_platform_variants(self):
        setup = load_setup()
        manifest = {"artifacts": [
            {"name": "local-core", "platform": "darwin", "arch": "arm64", "url": "mac"},
            {"name": "local-core", "platform": "windows", "arch": "x86_64", "url": "win"},
            {"name": "desktop-ui", "url": "ui"},
            {"name": "colab-skill", "url": "skill"},
            {"name": "electron-shell", "platform": "windows", "arch": "x86_64", "url": "shell"},
        ]}
        with mock.patch.object(setup, "platform_id", return_value=("windows", "x86_64")):
            selected = setup.select_artifacts(manifest)
        self.assertEqual(selected["local-core"]["url"], "win")
        self.assertEqual(selected["electron-shell"]["url"], "shell")
        self.assertEqual(selected["desktop-ui"]["url"], "ui")


if __name__ == "__main__":
    unittest.main()
