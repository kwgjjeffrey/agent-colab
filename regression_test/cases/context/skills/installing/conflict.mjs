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
  "status": "trial",
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

import fs from 'node:fs/promises';import path from 'node:path';
import {parameter,cli,data,disposable} from '../../../../support/client.mjs';
export const REQUIREMENTS={parameters:{keys:['disposable','skillRef','skillTarget']}};
export async function run(ctx){
 disposable(ctx);const ref=parameter(ctx,'skillRef'),target=parameter(ctx,'skillTarget');const receipt=data(await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target]));if(!path.basename(receipt.installedPath).startsWith('regression-owned'))ctx.block('Conflict checks require the owned regression Skill');const file=path.join(receipt.installedPath,'SKILL.md'),original=await fs.readFile(file,'utf8'),modified=original+'\nLOCAL_EDIT_'+ctx.runId+'\n';
 try{await fs.writeFile(file,modified);const result=await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target],{expectedCode:1});ctx.assert('Local modification conflict is reported',/conflict|locally modified/i.test(JSON.stringify(result)),true);ctx.assert('Conflicting local bytes are preserved',await fs.readFile(file,'utf8'),modified);}
 finally{await fs.writeFile(file,original);await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target]);ctx.assert('Owned installation is restored',await fs.readFile(file,'utf8'),original);}
}
