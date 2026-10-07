"""Publish signed local release fault fixtures; product installer remains unchanged."""
import pathlib,json,subprocess,hashlib,shutil,tarfile,io,yaml
ROOT=pathlib.Path(__file__).resolve().parents[1];app=pathlib.Path.home()/'.local/share/agent-colab';root=ROOT/'.fixtures/releases';root.mkdir(parents=True,exist_ok=True);origin='http://127.0.0.1:53593';profile=ROOT/'environment/environment.local.yaml';v=yaml.safe_load(profile.read_text());p=v['parameters']
subprocess.run(['curl','--noproxy','*','-fsSL','--retry','3',p['releaseManifestUrl'],'-o',str(root/'base.json')],check=True)
base=json.loads((root/'base.json').read_text());key=pathlib.Path.home()/'.config/agent-colab/release-signing-key'
def clone():return json.loads(json.dumps(base))
def artifact(doc,name):return next(x for x in doc['artifacts'] if x['name']==name and x.get('platform','darwin')=='darwin' and x.get('arch','arm64')=='arm64')
single=clone();ui=artifact(single,'desktop-ui');ui['version']='0.1.91-regression';single['version']='regression-ui-only'
tampered=clone();artifact(tampered,'desktop-ui').update(version='0.1.92-regression',sha256='0'*64)
unhealthy=clone();candidate=root/'unhealthy-core.tar.gz'
with tarfile.open(candidate,'w:gz') as archive:
 for name,content,mode in [('colabd',b'#!/bin/sh\nexit 1\n',0o755),('google-oauth.json',(app/'current/core/google-oauth.json').read_bytes(),0o600)]:
  info=tarfile.TarInfo(name);info.size=len(content);info.mode=mode;archive.addfile(info,io.BytesIO(content))
a=artifact(unhealthy,'local-core');a.update(version='0.1.93-regression',url=origin+'/'+candidate.name,size=candidate.stat().st_size,sha256=hashlib.sha256(candidate.read_bytes()).hexdigest())
for name,doc in [('base',base),('ui-only',single),('tampered',tampered),('unhealthy',unhealthy)]:
 f=root/(name+'.json');f.write_text(json.dumps(doc,indent=2)+'\n');sig=f.with_name(f.name+'.sig')
 if sig.exists():sig.unlink()
 subprocess.run(['ssh-keygen','-Y','sign','-q','-f',str(key),'-n','agent-colab-release',str(f)],check=True)
p.update(baseManifestUrl=origin+'/base.json',singleComponentManifestUrl=origin+'/ui-only.json',changedComponent='desktop-ui',tamperedManifestUrl=origin+'/tampered.json',unhealthyManifestUrl=origin+'/unhealthy.json');profile.write_text(yaml.safe_dump(v,sort_keys=False));print('signed release fixture bindings configured')
