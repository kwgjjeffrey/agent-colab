"""Read-only project adapter; reuse Core discovery auth without exposing credentials."""
import json,sys,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'skills/colab/lib'))
from local_api import request
try:
    channels=request('GET','/v1/channels',timeout=5)
    query=json.loads(sys.stdin.read() or '{}')
    rows=[{k:r.get(k) for k in ['id','name','role']} for r in channels]
    data={'channels':rows}
    if query.get('channelId'):
        cid=query['channelId']
        data['agents']=request('GET',f'/v1/channels/{cid}/blueprints',timeout=5)
        data['runtimes']=request('GET',f'/v1/channels/{cid}/agent-runtimes',timeout=5)
    print(json.dumps(data))
except Exception:
    print(json.dumps({'error':'Local Core inventory unavailable; check sign-in and connection'}))
    sys.exit(1)
