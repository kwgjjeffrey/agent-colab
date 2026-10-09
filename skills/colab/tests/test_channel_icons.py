import base64
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from test_browser_resolution import load_browser

browser = load_browser()
from channel_icons import icon_file_data_uri, MAX_ICON_BYTES

# Valid tiny PNG. Browser decoding is also exercised in the GUI regression.
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=")


class ChannelIconTest(unittest.TestCase):
    def test_actual_bytes_not_filename_determine_mime(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "icon.unknown"
            source.write_bytes(PNG)
            self.assertEqual(icon_file_data_uri(str(source)), "data:image/png;base64," + base64.b64encode(PNG).decode())

    def test_unsafe_missing_relative_and_oversize_files_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "icon.png"
            for content in (b"<svg/>", b"https://example.test/icon.png", b"", PNG + b"x" * MAX_ICON_BYTES):
                source.write_bytes(content)
                with self.assertRaises(ValueError):
                    icon_file_data_uri(str(source))
            with self.assertRaises(ValueError):
                icon_file_data_uri("relative.png")
            with self.assertRaises(ValueError):
                icon_file_data_uri(str(Path(folder) / "missing.png"))
            with self.assertRaises(ValueError):
                icon_file_data_uri(folder)

    def test_update_uses_existing_route_preserves_name_and_returns_bounded_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "icon.png"
            source.write_bytes(PNG)
            image = icon_file_data_uri(str(source))
            output = io.StringIO()
            with patch.object(browser, "resolve_channel_ref", return_value={"id": "selected", "name": "Keep name"}), patch.object(browser, "request", return_value={"name": "Keep name", "icon": image}) as request, patch("sys.argv", ["colab-browser", "update-channel", "--channel", "colab://channel/selected", "--icon-file", str(source)]), contextlib.redirect_stdout(output):
                self.assertEqual(browser.main(), 0)
            self.assertEqual(request.call_args.args, ("PATCH", "/v1/channels/selected"))
            self.assertEqual(request.call_args.kwargs["body"], {"name": "Keep name", "icon": image})
            self.assertIn('"iconUpdated": true', output.getvalue())
            self.assertNotIn("data:image", output.getvalue())

    def test_icon_sources_are_mutually_exclusive(self):
        with patch("sys.argv", ["colab-browser", "update-channel", "--channel", "colab://channel/A", "--icon", "x", "--icon-file", "/tmp/a.png"]), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as result:
                browser.main()
            self.assertEqual(result.exception.code, 2)
