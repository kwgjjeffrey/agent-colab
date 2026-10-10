import argparse
import importlib.util
import pathlib
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('colab_telemetry_test',ROOT/'lib/telemetry.py')
telemetry=importlib.util.module_from_spec(spec);spec.loader.exec_module(telemetry)

class TraceRegistryTests(unittest.TestCase):
    def test_nested_commands_resolve_full_parser_vocabulary(self):
        cases=[('colab-messages','request','reply','skill.messages.request.reply'),
               ('colab-messages','blueprint','select','skill.messages.blueprint.select'),
               ('colab-browser',None,'open','browser.open'),
               ('colab-canvas',None,'read','skill.canvas.read')]
        for executable,group,operation,expected in cases:
            with self.subTest(executable=executable,group=group,operation=operation),patch.object(sys,'argv',[executable,'--untrusted-resource','reply']):
                self.assertEqual(telemetry.command_definition(argparse.Namespace(group=group,operation=operation))['id'],expected)
    def test_actual_parsers_match_registry_without_business_io(self):
        result=subprocess.run([sys.executable,str(ROOT.parents[1]/'observability/tools/audit-entries.py')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr+result.stdout)
        self.assertIn('"cliLeafCommands": 55',result.stdout)

    def test_http_span_uses_current_scope_without_undefined_parent(self):
        # Run the enabled path with a tracer double; real SDK propagation is covered by
        # the live acceptance trace. Keep this regression independent of optional deps.
        import contextlib, types
        span=types.SimpleNamespace(set_attribute=lambda *args:None,set_attributes=lambda *args:None,set_status=lambda *args:None,end=lambda **kwargs:None)
        calls=[]
        @contextlib.contextmanager
        def start(*args,**kwargs):
            calls.append(kwargs);yield span
        tracer=types.SimpleNamespace(start_as_current_span=start)
        modules={
          'opentelemetry':types.ModuleType('opentelemetry'),
          'opentelemetry.trace':types.SimpleNamespace(SpanKind=types.SimpleNamespace(CLIENT=1),Status=lambda x:x,StatusCode=types.SimpleNamespace(ERROR=1)),
          'opentelemetry.propagate':types.SimpleNamespace(inject=lambda headers:headers.update({'traceparent':'current'})),
          'opentelemetry.baggage':types.SimpleNamespace(get_baggage=lambda key:'agents.forward'),
        }
        modules['opentelemetry'].baggage=modules['opentelemetry.baggage']
        with patch.dict(sys.modules,modules),patch.object(telemetry,'_tracer',tracer):
            headers={}
            with telemetry.request_span('POST',headers): pass
            self.assertEqual(headers['traceparent'],'current')
            self.assertNotIn('context',calls[0])
