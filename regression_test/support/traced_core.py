"""Send one real, correlated API request; private input stays on stdin."""
import json,pathlib,sys,urllib.request,urllib.error
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'skills/colab/lib'))
from local_api import discovery,_OPENER
value=json.load(sys.stdin)
endpoint,bearer=discovery()
request=urllib.request.Request(endpoint+'/v1/transfers/receive',data=json.dumps({'capability':value['capability']}).encode(),method='POST',headers={'Authorization':'Bearer '+bearer,'Content-Type':'application/json','traceparent':'00-'+value['traceId']+'-'+value['parentId']+'-01'})
try:
 with _OPENER.open(request,timeout=15) as response:print(json.dumps({'status':response.status,'body':response.read().decode()}))
except urllib.error.HTTPError as error:print(json.dumps({'status':error.code,'body':error.read().decode()}))
