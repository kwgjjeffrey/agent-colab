export const USECASE = {
  "name": "Protect locally modified or unmanaged Skills",
  "description": "Purpose: Capability distribution must not destroy a user's customization.\n\nPreconditions: A target contains an unmanaged same-name Skill, then a modified managed Skill.\n\nActions: Attempt install or update against each conflict.\n\nExpected results: Structured conflicts preserve local content; no silent overwrite occurs.\n\nVariations: report each object type or failure condition independently. Reset its isolated fixture between variations; an earlier failure must not suppress later results."
};

export const META = {
  "id": "context.skills.installing.conflict",
  "module": "context/skills/installing",
  "surface": "skill",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";

export async function run(ctx){
disposable(ctx);const ref=parameter(ctx,'skillRef'),target=parameter(ctx,'skillTarget'),file=parameter(ctx,'skillConflictFile');const original=await fs.readFile(file,'utf8');const result=await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target],{expectedCode:1});ctx.assert('Conflict is reported',JSON.stringify(result).toLowerCase().includes('conflict'),true);ctx.assert('Conflicting local bytes are preserved',await fs.readFile(file,'utf8'),original);
}
export const REQUIREMENTS={"parameters": {"keys": ["skillConflictFile", "skillRef", "skillTarget"]}};
