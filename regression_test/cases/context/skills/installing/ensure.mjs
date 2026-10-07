export const USECASE = {
  "name": "Ensure a shared Skill idempotently",
  "description": "Purpose: An agent should safely consume the same capability repeatedly.\n\nPreconditions: A test target has no conflicting Skill and a valid shared root exists.\n\nActions: Call ensure twice, then publish a changed source and call ensure again.\n\nExpected results: First call installs, second is a no-op, third updates to the new root with a matching ownership receipt."
};

export const META = {
  "id": "context.skills.installing.ensure",
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
  "testLevel": "end-to-end",
  "statusReason": "Round 8 20261007T121219Z-4bceb268: real ensure/update and eventual restored publication/install bytes verified; cleanup now waits for actual restored bytes."
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";

export async function run(ctx){
disposable(ctx);const ref=parameter(ctx,'skillRef'),target=parameter(ctx,'skillTarget'),source=parameter(ctx,'skillSourceFile');const original=await fs.readFile(source,'utf8');
const first=data(await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target]));const second=data(await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target]));ctx.assert('Repeated ensure has stable managed path',second.installedPath,first.installedPath);const bytes=await fs.readFile(first.installedPath+'/SKILL.md','utf8');ctx.assert('Installed fixture matches source',bytes,original);
try{await fs.writeFile(source,original+'\nUpdated '+ctx.runId+'\n');const id=ref.split('/').pop();await eventually(ctx,'Published root changes',async()=>{await core(ctx,'POST','/v1/skills/'+id+'/materialize');return core(ctx,'GET','/v1/skills/'+id+'/installations');},rows=>rows.some(i=>i.targetAgent===target&&i.currentRootOid!==i.installedRootOid),{timeoutMs:90000});await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target]);ctx.assert('New source reaches installation',(await fs.readFile(first.installedPath+'/SKILL.md','utf8')).includes('Updated '+ctx.runId),true);}finally{await fs.writeFile(source,original);await eventually(ctx,'Restored source is published and installed',async()=>{await core(ctx,'POST','/v1/skills/'+ref.split('/').pop()+'/materialize');await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target]);return fs.readFile(first.installedPath+'/SKILL.md','utf8');},bytes=>bytes===original,{timeoutMs:90000});ctx.assert('Source and installation are restored',await fs.readFile(first.installedPath+'/SKILL.md','utf8'),original);}
}
export const REQUIREMENTS={"parameters": {"keys": ["skillRef", "skillSourceFile", "skillTarget"]}};
