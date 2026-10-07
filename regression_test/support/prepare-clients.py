"""Provision real Core clients with private state. Never emit sessions or invitation capabilities."""
import json,os,pathlib,sqlite3,subprocess,sys,time,urllib.request,yaml
ROOT=pathlib.Path(__file__).resolve().parents[1];FIX=ROOT/'.fixtures'/'clients';APP=pathlib.Path.home()/'.local/share/agent-colab';SOURCE=pathlib.Path.home()/'Library/Application Support/online.agent-colab.Colab/colab.sqlite3'
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def request(discovery,method,route,body=None):
 d=json.loads(pathlib.Path(discovery).read_text());raw=None if body is None else json.dumps(body).encode()
 q=urllib.request.Request(d['endpoint']+route,data=raw,method=method,headers={'Authorization':'Bearer '+d['bearer'],'Content-Type':'application/json'})
 with OPENER.open(q,timeout=30) as r:
  b=r.read();return json.loads(b) if b else None
def launch(name,owner=False):
 root=FIX/name;root.mkdir(parents=True,exist_ok=True);os.chmod(root,0o700);db=root/'client.sqlite3';d=root/'discovery.json'
 if d.exists():
  try:
   request(d,'GET','/v1/status');return root
  except:pass
 core=APP/'current/core';env=dict(os.environ,COLAB_APPLICATION_ROOT=str(root),COLAB_LOCAL_DATABASE_PATH=str(db),COLAB_DISCOVERY_FILE=str(d),COLAB_GUI_ROOT=str(APP/'current/ui'),COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE=str(core/'google-oauth.json'),COLAB_SERVER_URL='http://127.0.0.1:'+str(53591 if name=='owner' else 53592) if name in ['owner','receiver'] else 'http://108.174.57.132:8787',HOSTNAME='Regression '+name)
 def start():
  log=(root/'core.log').open('ab');p=subprocess.Popen([str(core/'colabd')],env=env,stdout=log,stderr=log,start_new_session=True);log.close()
  for _ in range(100):
   try:request(d,'GET','/v1/status');return p
   except:time.sleep(.2)
  raise RuntimeError('Core readiness failed: '+name)
 p=start()
 if owner and not request(d,'GET','/v1/auth/status').get('authenticated'):
  p.terminate();p.wait(timeout=10)
  src=sqlite3.connect(SOURCE);dst=sqlite3.connect(db)
  # Copy authenticated account state only, never daily jobs, device keys or runtime IDs.
  cols=[x[1] for x in src.execute('pragma table_info(accounts)')]
  for row in src.execute('select * from accounts'):
   dst.execute('insert or replace into accounts('+','.join(cols)+') values('+','.join('?' for _ in cols)+')',row)
  for k,v in src.execute("select key,value from local_settings where key='current_user_id' or key like 'current_organization:%'"):
   dst.execute('insert or replace into local_settings(key,value) values(?,?)',(k,v))
  dst.commit();dst.close();src.close();os.chmod(db,0o600);p=start()
 if not owner or not sqlite3.connect(db).execute("select 1 from local_settings where key='device_account_migration_complete'").fetchone():request(d,'POST','/v1/auth/device/start',{})
 return root
if __name__=='__main__':
 primary=APP/'discovery.json';profile=ROOT/'environment/environment.local.yaml';config=yaml.safe_load(profile.read_text());params=config['parameters'];cid=params['channel']
 owner=launch('owner',True);receiver=launch('receiver',True);member=launch('member');third=launch('third')
 for root in [member,third]:
  link=request(primary,'POST',f'/v1/channels/{cid}/invite-links')
  try:request(root/'discovery.json','POST','/v1/invite-links/accept',{'token':link['token']})
  finally:request(primary,'DELETE','/v1/invite-links/'+link['id'])
  # Membership cases start with an org member outside the Channel.
  me=request(root/'discovery.json','GET','/v1/auth/status')['user'];rows=request(primary,'GET',f'/v1/channels/{cid}/members');row=next(x for x in rows if x['email']==me['email']);request(primary,'DELETE',f"/v1/channels/{cid}/members/{row['memberId']}")
 params.update(isolationConfirmed=True,isolatedCoreDiscoveryFile=str(owner/'discovery.json'),isolatedClientBaseUrl=json.loads((owner/'discovery.json').read_text())['endpoint']+'/',secondCoreDiscoveryFile=str(receiver/'discovery.json'),secondClientBaseUrl=json.loads((receiver/'discovery.json').read_text())['endpoint']+'/',secondMemberCoreDiscoveryFile=str(member/'discovery.json'),secondMemberEmail=request(member/'discovery.json','GET','/v1/auth/status')['user']['email'],thirdMemberEmail=request(third/'discovery.json','GET','/v1/auth/status')['user']['email'],continuousSourceFile=str(ROOT/'.fixtures/files/hello.txt'))
 profile.write_text(yaml.safe_dump(config,sort_keys=False));os.chmod(profile,0o600)
 print(json.dumps({'clients':[str(x) for x in [owner,receiver,member,third]],'configured':True}))
