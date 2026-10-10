#!/usr/bin/env python3
"""Audit actual argparse leaf commands against the live unit-owned registry; no business requests."""
import argparse, importlib.machinery, importlib.util, json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[2]
skill=root/'skills/colab'
sys.path.insert(0,str(skill/'lib'))
class Parsed(Exception):
    def __init__(self,parser): self.parser=parser
def stop(parser,*args,**kwargs):raise Parsed(parser)
def leaves(parser,path=(),inherited=()):
    arguments=inherited+tuple(a for a in parser._actions if not isinstance(a,(argparse._SubParsersAction,argparse._HelpAction)))
    sub=next((a for a in parser._actions if isinstance(a,argparse._SubParsersAction)),None)
    if sub:
        for name,child in sub.choices.items():yield from leaves(child,path+(name,),arguments)
    else:yield path,arguments
registry=json.loads((skill/'tracing/registry.json').read_text());registered={(o['entry']['executable'],tuple(o['entry']['args'])):o for o in registry['operations']}
missing=[];seen=set();argsparse=argparse.ArgumentParser.parse_args
try:
    argparse.ArgumentParser.parse_args=stop
    for file in sorted((skill/'bin').glob('colab-*')):
        if file.suffix or file.name in ('colab-open','colab-feedback-hook'):continue
        loader=importlib.machinery.SourceFileLoader('audit_'+file.name.replace('-','_'),str(file));spec=importlib.util.spec_from_loader(loader.name,loader);module=importlib.util.module_from_spec(spec);loader.exec_module(module)
        try:module.main()
        except Parsed as result:parser=result.parser
        else:raise RuntimeError('Command has no intercepted parser: '+file.name)
        for path,arguments in leaves(parser):
            key=(file.name,path);seen.add(key);definition=registered.get(key)
            if definition is None:missing.append({'executable':file.name,'args':path});continue
            # Parameters remain owned by argparse, not a copied registry projection.
finally:argparse.ArgumentParser.parse_args=argsparse
seen.add(('colab-open',()))
extra=[{'executable':key[0],'args':key[1]} for key in registered.keys()-seen]
if missing or extra:print(json.dumps({'ok':False,'missing':missing,'extra':extra},ensure_ascii=False));sys.exit(1)
print(json.dumps({'ok':True,'cliLeafCommands':len(seen),'registered':len(registered),'scope':'Parser vocabulary coverage; does not prove live tracing delivery'}))
