#!/usr/bin/env python3
"""Read-only installed Skill -> installed Core -> configured production Server probe."""
import contextlib,importlib.machinery,importlib.util,io,json,pathlib,sys
installed=pathlib.Path.home()/'.local/share/agent-colab/current/skill'
sys.path.insert(0,str(installed/'lib'))
loader=importlib.machinery.SourceFileLoader('colab_browser_production',str(installed/'bin/colab-browser'))
spec=importlib.util.spec_from_loader(loader.name,loader);module=importlib.util.module_from_spec(spec);loader.exec_module(module)
import telemetry
sys.argv=['colab-browser','open','--ref','colab://']
trace_ids=[]
def command():
 from opentelemetry.trace import get_current_span
 trace_ids.append(format(get_current_span().get_span_context().trace_id,'032x'))
 return module.main()
with contextlib.redirect_stdout(io.StringIO()) as output:code=telemetry.run(command)
result=json.loads(output.getvalue())
if code!=0 or not result.get('ok') or trace_ids[0]=='0'*32:raise SystemExit('Installed business request or tracing failed')
print(json.dumps({'trace_id':trace_ids[0],'exit_code':code,'channel_count':len(result['data']),'scope':'installed Skill/Core and real configured production Server'}))
