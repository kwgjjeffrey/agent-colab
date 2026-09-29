import json
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import unittest


SOURCE = pathlib.Path(__file__).resolve().parents[1]


class InstalledEntrypointTests(unittest.TestCase):
    """Exercise packaged commands as an Agent invokes them, not as imported source modules."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name) / "agent-colab"
        shutil.copytree(SOURCE, self.root)
        for command in list((self.root / "bin").glob("colab-*")) + [self.root / "setup/colab-setup"]:
            command.chmod(command.stat().st_mode | stat.S_IXUSR)

    def tearDown(self):
        self.temporary.cleanup()

    def run_command(self, relative, *arguments, env=None):
        result = subprocess.run(
            [str(self.root / relative), *arguments],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**os.environ, **(env or {})},
            timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        return result

    def test_all_packaged_cli_entrypoints_import_from_an_installed_tree(self):
        for command in ("colab-browser", "colab-session-reader", "colab-skill-tool", "colab-transfer"):
            with self.subTest(command=command):
                self.assertIn("usage:", self.run_command(f"bin/{command}", "--help").stdout)
        self.assertIn("usage:", self.run_command("setup/colab-setup", "--help").stdout)

    def test_colab_open_reads_discovery_and_invokes_platform_launcher(self):
        discovery = pathlib.Path(self.temporary.name) / "discovery.json"
        discovery.write_text(json.dumps({"endpoint": "http://127.0.0.1:32123", "bearer": "test-token"}))
        discovery.chmod(0o600)
        fake_bin = pathlib.Path(self.temporary.name) / "fake-bin"
        fake_bin.mkdir()
        launcher = fake_bin / ("open" if os.sys.platform == "darwin" else "xdg-open")
        launcher.write_text("#!/bin/sh\nexit 0\n")
        launcher.chmod(0o700)
        result = self.run_command(
            "bin/colab-open",
            env={"COLAB_DISCOVERY_FILE": str(discovery), "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}"},
        )
        self.assertTrue(json.loads(result.stdout)["ok"])


if __name__ == "__main__":
    unittest.main()
