"""Control only named regression clients and their owned fault proxies."""
import importlib.util,json,os,pathlib,signal,sys,time
spec=importlib.util.spec_from_file_location('prepare',pathlib.Path(__file__).with_name('prepare-clients.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
kind,op=sys.argv[1:3];case=sys.argv[3] if len(sys.argv)>3 else ''
if kind in ['network','realtime']:
 client='owner' if kind=='network' else 'receiver';state=p.FIX/client/'fault-mode'
 state.write_text(('publication-off' if 'files.recovery.retry' in case else 'off') if op=='disconnect' and kind=='network' else 'realtime-off' if op=='disconnect' else 'on')
elif kind in ['core','runtime']:
 import subprocess
 root=p.FIX/'owner';d=root/'discovery.json';domain='gui/'+str(os.getuid());label=domain+'/personal.colab.regression.owner'
 if kind=='core':subprocess.run(['launchctl','kickstart','-k',label],check=True)
 elif op=='disconnect':subprocess.run(['launchctl','bootout',label],check=True)
 elif op=='connect':
  try:p.request(d,'GET','/v1/status')
  except:subprocess.run(['launchctl','bootstrap',domain,str(root/'core.plist')],check=True)
 if op in ['connect','restart']:
  for _ in range(100):
   try:p.request(d,'GET','/v1/status');break
   except:time.sleep(.2)
  else:raise RuntimeError('Owned Core readiness failed')
else:raise SystemExit('Unknown owned control')
print(json.dumps({'control':kind,'operation':op,'completed':True}))
