import contextlib
import io
import json
import pathlib
import runpy
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse


class OpenInvitationTests(unittest.TestCase):
    def test_invitation_uses_recipients_discovery_without_exposing_credentials(self):
        script = pathlib.Path(__file__).resolve().parents[1] / "bin" / "colab-open"
        with tempfile.TemporaryDirectory() as directory:
            discovery = pathlib.Path(directory) / "discovery.json"
            discovery.write_text(json.dumps({"endpoint": "http://127.0.0.1:54321", "bearer": "test-local-secret"}))
            with patch.dict("os.environ", {"COLAB_DISCOVERY_FILE": str(discovery)}):
                namespace = runpy.run_path(str(script), run_name="colab_open_test")
            main = namespace["main"]
            output = io.StringIO()
            with patch.dict(main.__globals__, {"start_local_core": lambda: None}), \
                 patch("sys.argv", [str(script), "--invitation", "test-invite"]), \
                 patch("sys.platform", "darwin"), patch("subprocess.Popen") as opened, \
                 contextlib.redirect_stdout(output):
                self.assertEqual(main(), 0)
            url = opened.call_args.args[0][1]
            self.assertEqual(urlparse(url).netloc, "127.0.0.1:54321")
            self.assertEqual(parse_qs(urlparse(url).query), {"token": ["test-local-secret"], "join": ["test-invite"]})
            self.assertNotIn("test-local-secret", output.getvalue())
            self.assertNotIn("test-invite", output.getvalue())


if __name__ == "__main__":
    unittest.main()
