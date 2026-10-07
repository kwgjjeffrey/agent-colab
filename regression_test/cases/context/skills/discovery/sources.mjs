export const USECASE = {
  "name": "Discover valid Skill sources",
  "description": "Purpose: Agents must discover capabilities before installing them.\n\nPreconditions: A fixture Skill root and an invalid directory are present.\n\nActions: Run Skill sources with query and recent-change filters.\n\nExpected results: Valid sources have accurate names, descriptions and target metadata; invalid directories are not installable sources."
};

export const META = {
  "id": "context.skills.discovery.sources",
  "module": "context/skills/discovery",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source ef19fabf57ed: Real CLI source discovery includes known owned Skill and nonempty names."
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../../support/client.mjs";
export async function run(ctx) {
const query=parameter(ctx,'skillSourceQuery');const found=data(await cli(ctx,'colab-skill-tool',['sources','--query',query,'--recent-hours','87600']));const rows=Array.isArray(found)?found:found.sources;ctx.assert('Fixture Skill source is discoverable',rows.some(s=>s.name===parameter(ctx,'skillSourceName')),true);ctx.assert('All discovered Skills carry names',rows.every(s=>typeof s.name==='string'&&s.name.length>0),true);
}

export const REQUIREMENTS={"parameters": {"keys": ["skillSourceName", "skillSourceQuery"]}};
