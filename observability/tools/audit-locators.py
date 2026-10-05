#!/usr/bin/env python3
"""Check GUI locator bindings independently from span coverage; no generated registry copy."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[2]
registry = json.loads((root / 'desktop/ui/tracing/registry.json').read_text())
sources = '\n'.join(p.read_text() for p in (root / 'desktop/ui/src').rglob('*.tsx'))
ids = set()
for call in re.findall(r'traceTargets\(([^)]*)\)', sources):
    ids.update(re.findall(r'"([\w.-]+)"', call))
ids.update(re.findall(r'data-trace-target=\{operations\["([\w.-]+)"\]', sources))
regions = set(re.findall(r'data-trace-region=(?:\{"([\w.-]+)"\}|"([\w.-]+)")', sources))
regions = {v for pair in regions for v in pair if v}
nav = set(re.findall(r'data-trace-nav=\{"([\w.-]+)"\}', sources))
errors = []
for operation in registry['operations']:
    entry = operation['entry']; locator = entry.get('locator', {})
    if operation['id'] not in ids:
        errors.append(f"{operation['id']}: missing DOM binding")
    if locator.get('region') not in regions:
        errors.append(f"{operation['id']}: missing owning region {locator.get('region')}")
    for step in locator.get('steps', []):
        match = re.fullmatch(r'\[data-trace-nav="([\w.-]+)"\]', step['selector'])
        if not match or match[1] not in nav:
            errors.append(f"{operation['id']}: missing safe navigation {step['selector']}")
unknown = ids - {o['id'] for o in registry['operations']}
errors.extend(f'{id}: unregistered DOM target' for id in sorted(unknown))
print(json.dumps({'operations': len(registry['operations']), 'boundIds': len(ids),
                  'regions': sorted(regions), 'errors': errors}, ensure_ascii=False))
raise SystemExit(bool(errors))
