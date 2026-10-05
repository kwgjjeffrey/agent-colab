"""Installed product acceptance: the real Agent, not this script, edits the Canvas."""
import json
import pathlib
import subprocess
import sys
import uuid

repo = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo / 'skills/colab/lib'))
from local_api import request

channel = '6873b005-5f7d-416b-8eb6-41fc657d3ed6'
agent = 'e2045e37-1fab-445b-8ec0-82280b677c65'
marker = 'CANVAS_RUNTIME_ACCEPTANCE_' + uuid.uuid4().hex[:8]
canvas = request('POST', f'/v1/channels/{channel}/canvases', body={'title': marker})
instruction = f'Read this Canvas and append the exact line {marker} below this paragraph using the Canvas editing tool. Preserve all existing text and mentions. Do not merely reply: the document must be edited.'
seed = subprocess.check_output(['node', '--input-type=module', '-e', """
import {schema} from './codec.mjs';
import * as Y from 'yjs';
import {prosemirrorJSONToYDoc} from '@tiptap/y-tiptap';
const text=text=>({type:'text',text});
const mention=id=>({type:'mention',attrs:{id:process.argv[2],label:'Runtime Validation Agent',kind:'agent',mentionId:id}});
const node={type:'doc',content:[
 {type:'heading',attrs:{level:1},content:[text('Runtime acceptance')]},
 {type:'paragraph',content:[text(process.argv[1]+' '),mention('first')]},
 {type:'paragraph',content:[text('Preserve this second mention '),mention('second')]}
]};
console.log(Buffer.from(Y.encodeStateAsUpdate(prosemirrorJSONToYDoc(schema,node,'default'))).toString('base64'));
""", instruction, agent], cwd=repo / 'local/canvas-codec', text=True).strip()
request('POST', f"/v1/canvases/{canvas['id']}/updates", body={'update':seed,'clientUpdateId':str(uuid.uuid4())})
before = request('GET', f"/v1/canvases/{canvas['id']}/document")
task = request('POST', f"/v1/canvases/{canvas['id']}/send-to-agent", body={
 'targetBlueprintId':agent,'sectionMarkdown':before['content'],
 'canvasRef':f"colab://channel/1st%20channel/canvas/{marker}"})
print(json.dumps({'canvasId':canvas['id'],'requestId':task['id'],'marker':marker,'before':before,'task':task},ensure_ascii=False))
