"""Relink a disposable revocation actor for a new execution; never revoke a daily device."""
import importlib.util,json,pathlib,os,yaml,uuid
spec=importlib.util.spec_from_file_location('clients',pathlib.Path(__file__).with_name('prepare-clients.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
profile=p.ROOT/'environment/environment.local.yaml';config=yaml.safe_load(profile.read_text());params=config['parameters'];root=p.launch('revocable-'+uuid.uuid4().hex[:8],True);d=root/'discovery.json'
p.request(d,'POST','/v1/auth/device/login',{'userId':params['testUserId']})
devices=p.request(d,'GET','/v1/auth/devices');current=next(x for x in devices if x.get('current'));params['disposableDeviceId']=current['id'];params['revocableCoreDiscoveryFile']=str(d)
profile.write_text(yaml.safe_dump(config,sort_keys=False));os.chmod(profile,0o600)
print(json.dumps({'ready':True,'deviceId':current['id'],'fixture':'revocable'}))
