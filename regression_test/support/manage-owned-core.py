"""Install a launchd job scoped to the regression owner's private client directory."""
import importlib.util,json,os,pathlib,plistlib,subprocess,signal,time
s=importlib.util.spec_from_file_location('p',pathlib.Path(__file__).with_name('prepare-clients.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p);root=p.FIX/'owner';d=root/'discovery.json';label='personal.colab.regression.owner';domain='gui/'+str(os.getuid())
try:os.kill(json.loads(d.read_text())['pid'],signal.SIGTERM)
except ProcessLookupError:pass
subprocess.run(['launchctl','bootout',domain+'/'+label],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
core=pathlib.Path(os.environ.get('COLAB_REGRESSION_CORE_ROOT',root/'current/core')).resolve();gui=pathlib.Path(os.environ.get('COLAB_REGRESSION_GUI_ROOT',root/'current/ui')).resolve()
allowed=pathlib.Path(__file__).resolve().parents[2]
if not all(path.is_relative_to(allowed) for path in [core,gui]):raise SystemExit('Regression artifacts must be within this repository')
env={'PATH':os.environ['PATH'],'HOME':str(pathlib.Path.home()),'HOSTNAME':'Regression owner','COLAB_APPLICATION_ROOT':str(root),'COLAB_DISCOVERY_FILE':str(d),'COLAB_LOCAL_DATABASE_PATH':str(root/'client.sqlite3'),'COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE':str(core/'google-oauth.json'),'COLAB_GUI_ROOT':str(gui),'COLAB_SERVER_URL':os.environ.get('COLAB_REGRESSION_SERVER_URL','http://127.0.0.1:53591'),'COLAB_MANAGED_SERVICE':'launchd','COLAB_SETUP_PATH':str(pathlib.Path(__file__).with_name('owned-setup').resolve())}
plist=root/'core.plist';plist.write_bytes(plistlib.dumps({'Label':label,'ProgramArguments':[str(core/'colabd')],'EnvironmentVariables':env,'KeepAlive':True,'RunAtLoad':True,'StandardOutPath':str(root/'managed-core.log'),'StandardErrorPath':str(root/'managed-core.log')}));subprocess.run(['launchctl','bootstrap',domain,str(plist)],check=True)
for _ in range(100):
 try:p.request(d,'GET','/v1/status');break
 except:time.sleep(.2)
else:raise RuntimeError('Owned service failed readiness')
print('owned launchd Core ready')
