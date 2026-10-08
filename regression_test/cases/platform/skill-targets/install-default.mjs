export const USECASE = {
  "name": "Manage Skill targets and the default Agent",
  "description": "Purpose: GUI Agent actions depend on actual local installation state.\n\nPreconditions: Disposable Agent target roots are discoverable.\n\nActions: Install on one target, set default, then uninstall the selected managed target.\n\nExpected results: Target status and default selection reflect real receipts; other targets are unchanged and unmanaged content is preserved."
};

export const META = {
  "id": "platform.skill-targets.install-default",
  "module": "platform/skill-targets",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [],
  "affectedPaths": [
    "skills/colab/setup",
    "desktop/ui/src/features/updates"
  ],
  "suite": "release",
  "testLevel": "end-to-end",
  "statusReason": "Round 7 20261007T121017Z-7da12c1e: real GUI install/default/uninstall, unrelated target preservation and restoration reviewed.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:client.owner",
    "write:runtime.bound",
    "write:skill.installation",
    "read:browser.navigation"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated} from "../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["isolationConfirmed", "isolatedCoreDiscoveryFile", "isolatedClientBaseUrl", "disposableSkillTarget"]}};
export async function run(ctx){
const target=await isolated(ctx),agent=parameter(ctx,'disposableSkillTarget');const before=await core(ctx,'GET','/v1/system/installation',undefined,target);try{await ctx.page.goto(target.baseUrl);await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();const label={codex:'Codex',claude:'Claude Code',myflicker:'MyFlicker'}[agent];const row=ctx.page.locator('div.flex').filter({has:ctx.page.getByRole('button',{name:'Use '+label+' as default Agent',exact:true})}).last();if(before.targets[agent].installed)await row.getByRole('button',{name:'Uninstall',exact:true}).click();await row.getByRole('button',{name:'Install',exact:true}).click();await eventually(ctx,'Selected target is genuinely installed',()=>core(ctx,'GET','/v1/system/installation',undefined,target),v=>v.targets[agent].installed);await row.getByRole('button',{name:'Use '+label+' as default Agent',exact:true}).click();ctx.assert('Default selection is persisted',(await core(ctx,'GET','/v1/system/installation',undefined,target)).defaultAgent,agent);await row.getByRole('button',{name:'Uninstall',exact:true}).click();const after=await eventually(ctx,'Managed target is removed',()=>core(ctx,'GET','/v1/system/installation',undefined,target),v=>!v.targets[agent].installed);for(const other of Object.keys(before.targets).filter(x=>x!==agent))ctx.assert('Unrelated target is preserved',after.targets[other],before.targets[other]);}finally{const current=await core(ctx,'GET','/v1/system/installation',undefined,target);if(current.targets[agent].installed!==before.targets[agent].installed)await core(ctx,'POST','/v1/system/agents/'+agent+'/'+(before.targets[agent].installed?'install':'uninstall'),undefined,target);await core(ctx,'POST','/v1/system/agents/'+before.defaultAgent+'/default',undefined,target);}
}
