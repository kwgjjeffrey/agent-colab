#!/usr/bin/env python3
"""Static binding audit complements parser coverage and live trace readback; it isn't delivery proof."""
import json,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parents[2]
problems=[];counts={}
for unit,registry,source in [('desktop-ui','desktop/ui/tracing/registry.json','desktop/ui/src'),('local-core','local/tracing/registry.json','local/crates/local-api/src'),('server','server/standalone/tracing/registry.json','server/standalone/crates/api/src')]:
    value=json.loads((root/registry).read_text());definitions=value['operations'] if unit=='desktop-ui' else value['spans'];ids={row['id'] for row in definitions};bound=set()
    for file in (root/source).rglob('*'):
        if file.suffix not in ('.rs','.ts','.tsx') or '.test.' in file.name:continue
        text=file.read_text()
        if unit=='desktop-ui':bound.update(re.findall(r'runOperation(?:<[^>]+>)?\(\s*["\']([a-z][a-z0-9._-]+)["\']',text));bound.update(re.findall(r'beginOperation\(operations\[["\']([^"\']+)["\']\]',text))
        else:bound.update(re.findall(r'registered_business\(\s*include_str!\("[^"]+"\),\s*"([^"]+)"',text))
    for id in sorted(ids-bound):problems.append({'unit':unit,'unbound':id})
    for id in sorted(bound-ids):problems.append({'unit':unit,'unregistered':id})
    for row in definitions:
        if not (root/row['source']['path']).is_file():problems.append({'unit':unit,'missingSource':row['id']})
    counts[unit]={'registered':len(ids),'bound':len(bound)}
print(json.dumps({'ok':not problems,'counts':counts,'problems':problems,'scope':'Static binding only; not cloud delivery or every GUI event'},ensure_ascii=False))
sys.exit(bool(problems))
