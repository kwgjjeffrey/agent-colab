#!/usr/bin/env python3
"""Inventory source entry/result candidates; classification is explicit, never inferred coverage."""
import ast
import json
import pathlib
import re
root=pathlib.Path(__file__).resolve().parents[2]
entries=[]
results=[]
for path in sorted((root/'desktop/ui/src').rglob('*.tsx')):
 if '.test.' in path.name:continue
 for line,text in enumerate(path.read_text().splitlines(),1):
  for match in re.finditer(r'\b(set[A-Z][A-Za-z]+|onError|onNotice|onRequest)\s*\(',text):
   results.append({'surface':'gui','file':str(path.relative_to(root)),'line':line,'candidate':match.group(1),'classification':'review-required; may be intermediate/UI-only state'})
  for match in re.finditer(r'\b(on[A-Z][A-Za-z]+)\s*=\s*\{',text):
   entries.append({'surface':'gui','file':str(path.relative_to(root)),'line':line,'event':match.group(1),'classification':'review-required'})
for path in sorted((root/'skills/colab/bin').glob('colab-*')):
 if path.suffix=='.cmd':continue
 tree=ast.parse(path.read_text())
 for n in ast.walk(tree):
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in ("success","failure"):
   results.append({"surface":"skill","file":str(path.relative_to(root)),"line":n.lineno,"candidate":n.func.id,"classification":"output-boundary"})
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='add_parser' and n.args and isinstance(n.args[0],ast.Constant):
   entries.append({'surface':'skill','file':str(path.relative_to(root)),'line':n.lineno,'command':n.args[0].value,'classification':'terminal-wrapper'})
result={'schemaVersion':1,'meaning':'Source candidates, not a claim of complete semantic operation coverage. Review UI-only events and pair business entries with result contracts.','boundaries':entries,'resultBoundaries':results}
out=root/'observability/boundary-inventory.json'
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'gui_candidates':sum(e['surface']=='gui' for e in entries),'cli_subcommands':sum(e['surface']=='skill' for e in entries),'result_candidates':len(results)}))
