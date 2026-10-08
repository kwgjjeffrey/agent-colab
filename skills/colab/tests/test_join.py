import contextlib
import io
import pathlib
import runpy
import unittest
from unittest.mock import patch

class JoinTests(unittest.TestCase):
    def invoke(self, responses):
        script = pathlib.Path(__file__).resolve().parents[1] / "bin/colab-join"
        main = runpy.run_path(str(script))["main"]
        output = io.StringIO()
        with patch.dict(main.__globals__, {"request": unittest.mock.Mock(side_effect=responses)}), patch("sys.argv", [str(script), "--invitation", "private-invite", "--no-open"]), contextlib.redirect_stdout(output):
            result = main()
            calls = main.__globals__["request"].call_args_list
        return result, calls, output.getvalue()

    def test_registration_precedes_join(self):
        code, calls, output = self.invoke([{"authenticated": False}, {"requiresSelection": False}, {"authenticated": True}, {"channelId": "channel", "channelName": "Team"}])
        self.assertEqual(code, 0)
        self.assertEqual([call.args[1] for call in calls], ["/v1/auth/status", "/v1/auth/device/start", "/v1/auth/status", "/v1/invite-links/accept"])
        self.assertNotIn("private-invite", output)

    def test_selected_account_is_not_replaced(self):
        code, calls, _ = self.invoke([{"authenticated": True}, {"channelId": "channel", "channelName": "Team"}])
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 2)

    def test_multiple_accounts_never_guessed(self):
        code, calls, output = self.invoke([{"authenticated": False}, {"requiresSelection": True}])
        self.assertEqual(code, 2)
        self.assertEqual(len(calls), 2)
        self.assertIn("account_selection_required", output)
