"""Prepare only owned context fixtures and return non-secret environment bindings.

Pass the disposable Channel ID explicitly. Authentication stays in Local Core discovery.
"""
import json, pathlib, sys, uuid
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'skills/colab/lib'))
from local_api import request
cid=sys.argv[1]
root=pathlib.Path(__file__).resolve().parents[1]/'.fixtures'/('prepared-'+str(uuid.uuid4()))
root.mkdir(parents=True)
source=root/'session.jsonl'
rows=[]
for i in range(5):
 rows += [{'type':'response_item','payload':{'type':'message','role':'user','content':[{'type':'input_text','text':'FIXTURE_USER_'+str(i)}]}},{'type':'response_item','payload':{'type':'function_call','name':'fixture_read','call_id':'call_'+str(i),'arguments':'{}'}},{'type':'response_item','payload':{'type':'function_call_output','call_id':'call_'+str(i),'output':'OUTPUT_'+str(i)+'_'+'x'*500}},{'type':'response_item','payload':{'type':'message','role':'assistant','content':[{'type':'output_text','text':'ANSWER_'+str(i)}]}}]
source.write_text('\n'.join(map(json.dumps,rows))+'\n')
share=request('POST','/v1/channels/'+cid+'/sessions/share',body={'sourcePath':str(source),'sourceAdapter':'codex-jsonl-v1','name':'Regression Session with output'})
print(json.dumps({'sessionRef':'colab://channel/'+cid+'/'+share['id'],'sessionName':share['name'],'sessionSourcePath':str(source),'expectedUserMessage':'FIXTURE_USER_4','sessionExpectedTurnMarkers':['FIXTURE_USER_'+str(i) for i in range(5)]}))
