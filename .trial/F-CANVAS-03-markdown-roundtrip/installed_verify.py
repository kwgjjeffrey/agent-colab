"""Post-implementation, installed-Core regression through authenticated Local API."""
import json
import pathlib
import subprocess
import sys
import uuid

repo = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo / 'skills/colab/lib'))
from local_api import request

channel = '6873b005-5f7d-416b-8eb6-41fc657d3ed6'
title = 'Codec installed verification ' + uuid.uuid4().hex[:8]
canvas = request('POST', f'/v1/channels/{channel}/canvases', body={'title': title})
seed = subprocess.check_output(['node', '--input-type=module', '-e', """
import {schema} from './codec.mjs';
import * as Y from 'yjs';
import {prosemirrorJSONToYDoc} from '@tiptap/y-tiptap';
const text=text=>({type:'text',text});
const node={type:'doc',content:[
 {type:'heading',attrs:{level:1},content:[text('Installed regression')]},
 {type:'paragraph',content:[text('Append below this line '),{type:'mention',attrs:{id:'e2045e37-1fab-445b-8ec0-82280b677c65',label:'Runtime Validation Agent',kind:'agent',mentionId:'installed-test'}}]},
 {type:'paragraph'},
 {type:'paragraph',content:[text('Unchanged paragraph')]}
]};
console.log(Buffer.from(Y.encodeStateAsUpdate(prosemirrorJSONToYDoc(schema,node,'default'))).toString('base64'));
"""], cwd=repo / 'local/canvas-codec', text=True).strip()
request('POST', f"/v1/canvases/{canvas['id']}/updates", body={'update': seed, 'clientUpdateId': str(uuid.uuid4())})
before = request('GET', f"/v1/canvases/{canvas['id']}/document")
line = next(line for line in before['content'].splitlines() if 'Append below' in line)
patch = '\n'.join(['*** Begin Patch','*** Update File: document.md','@@',' '+line,'+','+Installed append passed','*** End Patch'])
result = request('POST', f"/v1/canvases/{canvas['id']}/apply-patch", body={'patch': patch})
after = request('GET', f"/v1/canvases/{canvas['id']}/document")
assert 'Installed append passed' in after['content']
assert line in after['content']
assert 'Unchanged paragraph' in after['content']
assert after['syncState'] == 'synced'
assert after['lastServerSeq'] > before['lastServerSeq']
print(json.dumps({'canvasId':canvas['id'],'title':title,'patch':result,'document':after},ensure_ascii=False))
