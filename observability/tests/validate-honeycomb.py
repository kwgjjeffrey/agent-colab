#!/usr/bin/env python3
"""Run the real packaged CLI across two independent boundary processes into Honeycomb test.
Requires the built boundary_probe and the private test ingest configuration. No product DB.
"""
import argparse
import zipfile
import importlib.machinery
import importlib.util
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
root=pathlib.Path(__file__).resolve().parents[2]
private=pathlib.Path.home()/'.config/agent-colab/observability'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--provider',choices=['honeycomb','grafana'],default='honeycomb')
parser.add_argument('--vendor',type=pathlib.Path,help='Optional already bundled lib/vendor directory')
args=parser.parse_args()
profiles=json.loads((private/'providers.json').read_text())
profile=profiles['providers'][args.provider]
credential=json.loads((private/profile['credentialsFile']).read_text())
import base64
config={'endpoint':profile['endpoint'],'key':credential.get('key','')}
auth_name='x-honeycomb-team' if args.provider=='honeycomb' else 'authorization'
auth_value=config['key'] if args.provider=='honeycomb' else 'Basic '+base64.b64encode((profile['instanceId']+':'+credential['token']).encode()).decode()
def port():
 with socket.socket() as sock:
  sock.bind(('127.0.0.1',0));return sock.getsockname()[1]
server_port,core_port=port(),port()
base=dict(os.environ,OTEL_EXPORTER_OTLP_ENDPOINT=config['endpoint'],OTEL_EXPORTER_OTLP_HEADERS=auth_name+'='+urllib.parse.quote(auth_value,safe=''),PROBE_AUTH_HEADER=auth_name,PROBE_AUTH_VALUE=auth_value)
probe=root/'observability/rust/target/debug/examples/boundary_probe'
processes=[]
with tempfile.TemporaryDirectory() as temp:
 temp=pathlib.Path(temp)
 installed=temp/'agent-colab';shutil.copytree(root/'skills/colab',installed)
 # The portable bundle is supplied explicitly, not imported from globally installed SDKs.
 if args.vendor:
  shutil.copytree(args.vendor,installed/'lib/vendor')
 else:
  version=(root/'skills/colab/VERSION').read_text().strip()
  artifact=root/'dist/colab-skill'/(version+'.zip')
  with zipfile.ZipFile(artifact) as bundle:
   for item in bundle.infolist():
    marker='lib/vendor/'
    if marker in item.filename and not item.is_dir():
     target=installed/marker/item.filename.split(marker,1)[1]
     target.parent.mkdir(parents=True,exist_ok=True)
     target.write_bytes(bundle.read(item))
 for p in (installed/'lib/vendor').rglob('*'):
  if p.suffix in ('.so','.pyd','.dylib'):p.unlink()
 def start(role,p,extra):
  log=open(temp/(role+'.log'),'w')
  proc=subprocess.Popen([str(probe)],env=dict(base,PROBE_ROLE=role,PROBE_ADDRESS='127.0.0.1:'+str(p),**extra),stdout=log,stderr=log);processes.append(proc)
  for _ in range(100):
   if proc.poll() is not None:raise RuntimeError(role+' fixture exited')
   try:
    urllib.request.urlopen('http://127.0.0.1:'+str(p)+'/v1/observability/clock',timeout=.2).close();return
   except Exception:time.sleep(.1)
  raise RuntimeError(role+' fixture failed readiness')
 try:
  start('server',server_port,{})
  start('core',core_port,{'PROBE_SERVER':'http://127.0.0.1:'+str(server_port)})
  discovery=temp/'discovery.json';discovery.write_text(json.dumps({'endpoint':'http://127.0.0.1:'+str(core_port),'bearer':'boundary-fixture-only'}));discovery.chmod(0o600)
  os.environ['COLAB_DISCOVERY_FILE']=str(discovery)
  sys.path.insert(0,str(installed/'lib'))
  loader=importlib.machinery.SourceFileLoader('colab_browser_probe',str(installed/'bin/colab-browser'))
  spec=importlib.util.spec_from_loader(loader.name,loader);module=importlib.util.module_from_spec(spec);loader.exec_module(module)
  import telemetry
  sys.argv=['colab-browser','open','--ref','colab://']
  trace_ids=[]
  def command():
   from opentelemetry.trace import get_current_span
   trace_ids.append(format(get_current_span().get_span_context().trace_id,'032x'))
   return module.main()
  code=telemetry.run(command)
  if code!=0 or not trace_ids or trace_ids[0]=='0'*32:raise RuntimeError('CLI trace missing or command failed')
  # Rust batch workers have independent queues; allow their actual scheduled export to occur.
  time.sleep(6)
  evidence={'trace_id':trace_ids[0],'provider':args.provider,'environment':'test' if args.provider=='honeycomb' else 'grafana-stack','cli_exit_code':code,'scope':'real CLI + production boundary middleware in isolated fixtures; not deployed business endpoint acceptance'}
  (private/'boundary-validation.json').write_text(json.dumps(evidence,indent=2))
  print(json.dumps(evidence))
 finally:
  for p in processes:p.terminate()
  for p in processes:
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:p.kill()
