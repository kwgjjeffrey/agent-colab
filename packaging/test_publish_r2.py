import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('publisher',Path(__file__).with_name('publish_r2.py'))
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)

class PublicationGuardTests(unittest.TestCase):
    def test_promotion_order(self):
        self.assertGreater(publisher.promotion_order('0.1.212-dev'), publisher.promotion_order('0.1.211-dev'))
        with self.assertRaises(SystemExit): publisher.promotion_order('not-a-version')

    def test_refuses_stale_promotion(self):
        def download(url,destination): destination.write_text(json.dumps({'version':'0.1.211-dev','artifacts':[]}))
        with patch.object(publisher,'public_download',download):
            for version in ('0.1.210-dev','0.1.211-dev'):
                with self.assertRaises(SystemExit): publisher.current_channel('https://example.test',version)
            self.assertEqual(publisher.current_channel('https://example.test','0.1.212-dev'),{})

    def test_live_lock_blocks_second_publisher(self):
        with tempfile.TemporaryDirectory() as directory:
            child=subprocess.Popen([sys.executable,'-c','import sys,time; from pathlib import Path; sys.path.insert(0,sys.argv[1]); import publish_r2; publish_r2.acquire_publish_lock(Path(sys.argv[2])); print("locked",flush=True); time.sleep(20)',str(Path(__file__).parent),directory],stdout=subprocess.PIPE,text=True)
            try:
                self.assertEqual(child.stdout.readline().strip(),'locked')
                with self.assertRaises(SystemExit): publisher.acquire_publish_lock(Path(directory))
            finally:child.terminate();child.wait(timeout=5);child.stdout.close()

    def test_unreadable_stable_fails_closed(self):
        with patch.object(publisher,'public_download',side_effect=OSError('unavailable')):
            with self.assertRaises(SystemExit): publisher.current_channel('https://example.test','0.1.212-dev')

if __name__=='__main__':unittest.main()
