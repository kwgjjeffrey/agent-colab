"""Publish owned hostile Git packs through the real Server transport for consumer validation."""
import importlib.util,pathlib,sqlite3,json,subprocess,os,urllib.request,yaml
spec=importlib.util.spec_from_file_location('p',pathlib.Path(__file__).with_name('prepare-clients.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
profile=p.ROOT/'environment/environment.local.yaml';cfg=yaml.safe_load(profile.read_text());params=cfg['parameters'];cid=params['channel'];p.request(p.APP/'discovery.json','GET','/v1/channels')
db=sqlite3.connect(p.SOURCE);user=db.execute("select value from local_settings where key='current_user_id'").fetchone()[0];session=json.loads(db.execute('select session_json from accounts where user_id=?',(user,)).fetchone()[0]);token=session.get('accessToken') or session.get('access_token');assert token
sentinel=p.FIX/'owner/materialized/sentinel.txt';sentinel.parent.mkdir(parents=True,exist_ok=True);sentinel.write_text('OWNED_SENTINEL_UNCHANGED')
def remote(method,path,body,content='application/json'):
 q=urllib.request.Request('http://108.174.57.132:8787'+path,method=method,data=body,headers={'Authorization':'Bearer '+token,'Content-Type':content})
 with p.OPENER.open(q,timeout=30) as r:return json.loads(r.read())
fixtures=[]
for kind in ['traversal','symlink']:
 root=p.ROOT/'.fixtures/hostile'/kind;root.mkdir(parents=True,exist_ok=True);subprocess.run(['git','init','--bare','-q',str(root)],check=True)
 def git(*args,input=None):return subprocess.check_output(['git','--git-dir='+str(root),*args],input=input,env=dict(os.environ,GIT_AUTHOR_NAME='Regression',GIT_AUTHOR_EMAIL='regression@example.test',GIT_COMMITTER_NAME='Regression',GIT_COMMITTER_EMAIL='regression@example.test'))
 blob=git('hash-object','-w','--stdin',input=(str(sentinel) if kind=='symlink' else 'HOSTILE_REPLACEMENT').encode()).decode().strip();name='escape' if kind=='symlink' else '../../sentinel.txt';mode='120000' if kind=='symlink' else '100644';tree=git('hash-object','--literally','-t','tree','-w','--stdin',input=(mode+' '+name).encode()+b'\0'+bytes.fromhex(blob)).decode().strip();commit=git('commit-tree',tree,input=b'Owned hostile fixture\n').decode().strip();pack=git('pack-objects','--stdout','--revs',input=(commit+'\n').encode());share=remote('POST','/v1/channels/'+cid+'/files',json.dumps({'name':'Regression hostile '+kind}).encode());remote('POST','/v1/files/'+share['id']+'/revisions?rootOid='+commit,pack,'application/x-git-packed-objects');fixtures.append({'kind':kind,'shareId':share['id'],'outsideSentinel':str(sentinel)})
params['unsafeMaterializationFixtures']=fixtures;profile.write_text(yaml.safe_dump(cfg,sort_keys=False));print('two owned malicious transport fixtures configured')
