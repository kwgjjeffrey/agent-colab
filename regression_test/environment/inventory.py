"""Read-only project adapter; reuse Core discovery auth without exposing credentials."""
import json,sys,pathlib,os,time,re
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'skills/colab/lib'))
from local_api import request
def read_route(route):
    # Preflight is a read-only availability probe. Bounded transient gateway/timeout retries avoid
    # excluding an entire selection; authorization and binding errors are never retried.
    for attempt in range(3):
        try:
            return request('GET',route,timeout=4)
        except Exception as error:
            if attempt==2 or not (re.search(r'HTTP (502|503|504)',str(error)) or isinstance(error,TimeoutError)):
                raise
            time.sleep(0.25)

try:
    query=json.loads(sys.stdin.read() or '{}')
    routes={'channels':'/v1/channels'}
    if query.get('deviceDiscoveryFile'):
        os.environ['COLAB_DISCOVERY_FILE']=query['deviceDiscoveryFile'];routes={'devices':'/v1/auth/devices'}
    if query.get('channelId'):
        cid=query['channelId']
        routes.update(agents=f'/v1/channels/{cid}/blueprints',runtimes=f'/v1/channels/{cid}/agent-runtimes')
    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs={kind:pool.submit(read_route,route) for kind,route in routes.items()}
        data={kind:job.result() for kind,job in jobs.items()}
    if 'channels' in data:data['channels']=[{k:r.get(k) for k in ['id','name','role']} for r in data['channels']]
    print(json.dumps(data))
except Exception as error:
    status=re.search(r'HTTP [0-9]{3}',str(error))
    print(json.dumps({'error':'Local Core inventory unavailable: '+(status.group(0) if status else type(error).__name__)}))
    sys.exit(1)
