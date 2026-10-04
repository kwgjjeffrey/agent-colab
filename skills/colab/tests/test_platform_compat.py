import importlib.machinery
import importlib.util
import pathlib
import sys
import tempfile
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
    def test_release_fetch_bypasses_proxies_and_retries(self):
        setup = load_setup()
        completed = mock.Mock(returncode=0, stderr=b"")
        with mock.patch.object(setup.shutil, "which", return_value="/usr/bin/curl"), mock.patch.object(
            setup.subprocess, "run", return_value=completed
        ) as run:
            setup.fetch_release_url("https://example.test/release.json", pathlib.Path("/tmp/release.json"), 30)
        command = run.call_args.args[0]
        self.assertIn("--noproxy", command)
        self.assertIn("--retry-all-errors", command)
        self.assertIn("--continue-at", command)
        self.assertIn("--speed-time", command)
        self.assertIn("--max-time", command)
        self.assertEqual(command[-1], "https://example.test/release.json")

    def test_artifact_download_has_no_fixed_total_timeout(self):
        setup = load_setup()
        payload = b"artifact"
        with tempfile.TemporaryDirectory() as directory:
            target = pathlib.Path(directory) / "artifact.zip"
            setup.UPDATE_PROGRESS = pathlib.Path(directory) / "progress.json"
            setup.DOWNLOAD_CACHE = pathlib.Path(directory) / "downloads"
            def execute(command, **_kwargs):
                pathlib.Path(command[command.index("--output") + 1]).write_bytes(payload)
                return mock.Mock(returncode=0, stderr=b"")
            with mock.patch.object(setup.shutil, "which", return_value="/usr/bin/curl"), mock.patch.object(
                setup.subprocess, "run", side_effect=execute
            ) as run:
                setup.download("https://example.test/artifact.zip", setup.hashlib.sha256(payload).hexdigest(), len(payload), target)
        command = run.call_args.args[0]
        self.assertNotIn("--max-time", command)
        self.assertIn("--continue-at", command)

    def test_artifact_download_resumes_a_persistent_partial(self):
        setup = load_setup()
        payload = b"0123456789"
        digest = setup.hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            setup.ROOT = root
            setup.UPDATE_PROGRESS = root / "progress.json"
            setup.DOWNLOAD_CACHE = root / "downloads"
            setup.DOWNLOAD_CACHE.mkdir()
            (setup.DOWNLOAD_CACHE / f"{digest}.part").write_bytes(payload[:4])
            (setup.DOWNLOAD_CACHE / f"{digest}.json").write_text(setup.json.dumps({
                "url":"https://example.test/artifact.zip","sha256":digest,
                "size":len(payload),"artifact":"artifact.zip",
            }))
            target = root / "artifact.zip"
            def execute(command, **_kwargs):
                output = pathlib.Path(command[command.index("--output") + 1])
                with output.open("ab") as stream: stream.write(payload[4:])
                return mock.Mock(returncode=0, stderr=b"")
            with mock.patch.object(setup.shutil, "which", return_value="/usr/bin/curl"), mock.patch.object(
                setup.subprocess, "run", side_effect=execute
            ) as run:
                setup.download("https://example.test/artifact.zip", digest, len(payload), target)
            self.assertEqual(target.read_bytes(), payload)
            self.assertIn("--continue-at", run.call_args.args[0])
            progress = setup.json.loads(setup.UPDATE_PROGRESS.read_text())
            self.assertEqual(progress["state"], "completed")

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

    def test_legacy_combined_update_is_detected_from_parent_command(self):
        setup = load_setup()
        completed = mock.Mock(stdout="python current/skill/setup/colab-setup update --no-restart\n")
        with mock.patch.object(setup.sys, "platform", "darwin"), mock.patch.object(
            setup.subprocess, "run", return_value=completed
        ):
            self.assertTrue(setup.invoked_by_legacy_combined_update())

    def test_direct_shell_update_is_not_mistaken_for_legacy_parent(self):
        setup = load_setup()
        completed = mock.Mock(stdout="python current/skill/setup/colab-setup update-shell\n")
        with mock.patch.object(setup.sys, "platform", "darwin"), mock.patch.object(
            setup.subprocess, "run", return_value=completed
        ):
            self.assertFalse(setup.invoked_by_legacy_combined_update())


if __name__ == "__main__":
    unittest.main()
