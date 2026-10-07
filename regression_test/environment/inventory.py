"""Read-only project adapter; reuse Core discovery auth without exposing credentials."""
import json,sys,pathlib
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'skills/colab/lib'))
from local_api import request
try:
    query=json.loads(sys.stdin.read() or '{}')
    routes={'channels':'/v1/channels'}
    if query.get('channelId'):
        cid=query['channelId']
        routes.update(agents=f'/v1/channels/{cid}/blueprints',runtimes=f'/v1/channels/{cid}/agent-runtimes')
    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs={kind:pool.submit(request,'GET',route,timeout=12) for kind,route in routes.items()}
        data={kind:job.result() for kind,job in jobs.items()}
    data['channels']=[{k:r.get(k) for k in ['id','name','role']} for r in data['channels']]
    print(json.dumps(data))
except Exception:
    print(json.dumps({'error':'Local Core inventory unavailable; check sign-in and connection'}))
    sys.exit(1)
