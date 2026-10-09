import unittest
from unittest.mock import patch
from test_browser_resolution import load_browser

class FilesScopeTest(unittest.TestCase):
    def test_files_share_passes_exclusions_to_core(self):
        browser=load_browser()
        with patch.object(browser,"resolve_channel_ref",return_value={"id":"ch","name":"Team"}), patch.object(browser,"request",return_value={"id":"item","name":"Docs"}) as request:
            browser.share_item("core","colab://channel/Team","files","/tmp/docs",None,["dist"])
        self.assertEqual(request.call_args.kwargs["body"]["syncExcludes"],["dist"])

    def test_exclusions_rejected_for_skill(self):
        browser=load_browser()
        with self.assertRaises(ValueError):
            browser.share_item("core","colab://channel/Team","skill","/tmp/skill",None,["dist"])
