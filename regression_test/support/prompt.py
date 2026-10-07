"""Read only the test request's actual Codex input, never unrelated session history."""
import json,pathlib,sys,uuid
thread=str(uuid.UUID(sys.argv[1]))
files=list((pathlib.Path.home()/'.codex/sessions').glob('**/*'+thread+'.jsonl'))
if len(files)!=1:
    print(json.dumps({'found':False}));sys.exit(0)
inputs=[]
for line in files[0].read_text().splitlines():
    item=json.loads(line)
    if item.get('type')=='response_item' and item.get('payload',{}).get('role')=='user':
        inputs.append(''.join(c.get('text','') for c in item['payload'].get('content',[]) if isinstance(c,dict)))
print(json.dumps({'found':True,'inputs':inputs}))
