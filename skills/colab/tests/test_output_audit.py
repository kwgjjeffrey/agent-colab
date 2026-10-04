"""Execute read/consume entrypoints against an isolated Local Core response fixture."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_GET(self):
        values = {
            '/v1/observability/config': {'enabled':False},
            '/v1/channels': [{'id':'c','name':'Audit'}],
            '/v1/channels/c/sessions': [{'id':'s','name':'Session'}],
            '/v1/channels/c/skills': [{'id':'k','name':'Skill'}],
            '/v1/skills/k/installations': [{'targetAgent':'codex','state':'installed','installedRootOid':'internal'}],
            '/v1/channels/c/canvases': [{'id':'d','title':'Doc','schemaVersion':1}],
            '/v1/channels/c/canvas-folders': [],
            '/v1/canvases/d/document': {'content':'# Heading\nText\n','path':'document.md','revision':'revision','lastServerSeq':9,'syncState':'synced'},
        }
        self.respond(values[self.path])
    def do_POST(self):
        self.rfile.read(int(self.headers.get('content-length','0')))
        self.respond({'turns':[{'items':[{'type':'agentMessage','text':'Response'}]}], 'page':{'nextCursor':'next','snapshot':'internal'}})
    def respond(self, value):
        raw=json.dumps(value).encode()
        self.send_response(200); self.send_header('content-length',str(len(raw))); self.end_headers(); self.wfile.write(raw)

class OutputAuditTests(unittest.TestCase):
    def test_read_entrypoints_with_isolated_response_shapes(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                discovery=Path(directory)/'discovery.json'
                discovery.write_text(json.dumps({'endpoint':f'http://127.0.0.1:{server.server_port}','bearer':'test'})); discovery.chmod(0o600)
                commands=[
                    ['colab-session-reader','read','--ref','colab://channel/Audit/Session'],
                    ['colab-skill-tool','status','--ref','colab://channel/Audit/Skill'],
                    ['colab-skill-tool','check-update','--ref','colab://channel/Audit/Skill','--target','codex'],
                    ['colab-canvas','read','--ref','colab://channel/Audit/canvas/Doc'],
                    ['colab-canvas','search','--ref','colab://channel/Audit/canvas/Doc','--query','Text'],
                ]
                for command in commands:
                    with self.subTest(command=command):
                        result=subprocess.run([str(ROOT/'bin'/command[0]),*command[1:]],env={**os.environ,'COLAB_DISCOVERY_FILE':str(discovery)},capture_output=True,text=True,timeout=10)
                        self.assertEqual(result.returncode,0,result.stderr)
                        envelope = json.loads(result.stdout)
                        self.assertTrue(envelope['ok'])
                        self.assertNotIn('internal', result.stdout)
                        self.assertNotIn('lastServerSeq', result.stdout)
                        if command[0] == 'colab-session-reader':
                            self.assertEqual(envelope['data']['turns'][0]['items'][0]['text'], 'Response')
                            self.assertEqual(envelope['page'], {'nextCursor':'next'})
        finally:
            server.shutdown(); server.server_close()
