"""Test-only bridge to the real Local Core; credentials never enter JSON output."""
import sys,pathlib,json,urllib.error,os,time,re
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'skills/colab/lib'))
from local_api import request, LocalApiError
try:
    if len(sys.argv)>4 and sys.argv[4]:
        os.environ['COLAB_DISCOVERY_FILE']=sys.argv[4]
    body=json.load(sys.stdin) if sys.argv[3]=="-" else json.loads(sys.argv[3]) if len(sys.argv)>3 else None
    # Retry only transient idempotent reads. Writes and permission/validation errors
    # retain their first outcome; retry must not duplicate product mutations.
    for attempt in range(3):
        try:
            value=request(sys.argv[1],sys.argv[2],body=body,timeout=float(sys.argv[5]) if len(sys.argv)>5 else 15)
            break
        except LocalApiError as error:
            if sys.argv[1]!='GET' or attempt==2 or not re.search(r'HTTP (502|503|504)',str(error)):
                raise
            time.sleep(.25)
    print(json.dumps({'ok':True,'data':value}))
except LocalApiError as e:
    print(json.dumps({'ok':False,'error':str(e)}));sys.exit(1)
except (OSError, ValueError) as e:
    # Transport failures still need a machine-readable result. Do not expose
    # request headers/capabilities through exception representations.
    print(json.dumps({'ok':False,'error':'Local Core transport/response failure: '+type(e).__name__}));sys.exit(1)
