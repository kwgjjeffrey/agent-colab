export const USECASE = {
  "name": "Uninstall only a managed Skill target",
  "description": "Purpose: Target selection and ownership must constrain removal.\n\nPreconditions: A shared Skill is installed in two disposable Agent targets.\n\nActions: Uninstall it from one target and inspect both receipts and paths.\n\nExpected results: Only the selected managed installation is removed; other targets remain intact."
};

export const META = {
  "id": "context.skills.installing.uninstall",
  "module": "context/skills/installing",
  "surface": "skill",
  "priority": "normal",
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
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../../support/client.mjs";
export async function run(ctx) {
 disposable(ctx);const ref=parameter(ctx,'skillRef'),target=parameter(ctx,'skillTarget'),controlTarget=parameter(ctx,'skillControlTarget');ctx.assert('Selected and control targets are distinct',target!==controlTarget,true);
 const initial=data(await cli(ctx,'colab-skill-tool',['status','--ref',ref]));const controlWasInstalled=initial.installations.some(i=>i.targetAgent===controlTarget&&i.state==='installed');const receipt=data(await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target]));if(!path.basename(receipt.installedPath).startsWith('regression-owned'))ctx.block('Uninstall checks require the owned regression Skill');await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',controlTarget]);const before=data(await cli(ctx,'colab-skill-tool',['status','--ref',ref]));const control=before.installations.find(i=>i.targetAgent===controlTarget);ctx.assert('Both fixture targets are installed',before.installations.some(i=>i.targetAgent===target&&i.state==='installed')&&control?.state==='installed',true);const original=await fs.readFile(control.installedPath+'/SKILL.md','utf8');
 try{await cli(ctx,'colab-skill-tool',['uninstall','--ref',ref,'--target',target]);const after=data(await cli(ctx,'colab-skill-tool',['status','--ref',ref]));ctx.assert('Selected installation is removed',after.installations.every(i=>i.targetAgent!==target||i.state==='not_installed'),true);ctx.assert('Control target remains installed',after.installations.some(i=>i.targetAgent===controlTarget&&i.state==='installed'&&i.installedPath===control.installedPath),true);ctx.assert('Control target bytes remain unchanged',await fs.readFile(control.installedPath+'/SKILL.md','utf8'),original);}finally{await cli(ctx,'colab-skill-tool',['ensure','--ref',ref,'--target',target]);if(!controlWasInstalled)await cli(ctx,'colab-skill-tool',['uninstall','--ref',ref,'--target',controlTarget]);}
}

export const REQUIREMENTS={"parameters": {"keys": ["skillRef", "skillTarget", "skillControlTarget", "disposable"]}};
