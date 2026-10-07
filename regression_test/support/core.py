"""Test-only bridge to the real Local Core; credentials never enter JSON output."""
import sys,pathlib,json,urllib.error,os
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'skills/colab/lib'))
from local_api import request, LocalApiError
try:
    if len(sys.argv)>4 and sys.argv[4]:
        os.environ['COLAB_DISCOVERY_FILE']=sys.argv[4]
    value=request(sys.argv[1],sys.argv[2],body=json.loads(sys.argv[3]) if len(sys.argv)>3 else None,timeout=15)
    print(json.dumps({'ok':True,'data':value}))
except LocalApiError as e:
    print(json.dumps({'ok':False,'error':str(e)}));sys.exit(1)
