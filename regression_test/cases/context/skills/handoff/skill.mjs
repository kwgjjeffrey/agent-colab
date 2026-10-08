export const USECASE = {
  "name": "Generate an idempotent Skill handoff",
  "description": "Purpose: Handoff should avoid manual installation choreography.\n\nPreconditions: A shared Skill is missing or outdated on a disposable target.\n\nActions: Open Give to Agent and inspect the target-specific instruction.\n\nExpected results: The prompt uses ensure for a missing or stale root and identifies the installed Skill when current."
};

export const META = {
  "id": "context.handoff.skill",
  "module": "context/skills/handoff",
  "surface": "gui",
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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 790ca74d0301: Actual selected Skill handoff matches current installation branch: managed path or idempotent ensure with exact resource.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:skill.fixture",
    "read:skill.installation"
  ]
};

import {openTab,item,handoff} from "../../../../support/gui.mjs";
import {parameter} from "../../../../support/client.mjs";
export async function run(ctx){
 const row=await item(ctx,'Skills','skillName');const id=parameter(ctx,'skillRef').split('/').pop();const status=await core(ctx,'GET','/v1/system/installation');const installed=(await core(ctx,'GET','/v1/skills/'+id+'/installations')).find(x=>x.targetAgent===status.defaultAgent);
 if(installed?.state==='installed'){const targetLabel={codex:'Codex',claude:'Claude Code',myflicker:'MyFlicker'}[status.defaultAgent]??status.defaultAgent;await row.getByText(targetLabel,{exact:true}).waitFor();await row.getByRole('button',{name:'Uninstall',exact:true}).first().waitFor();}
 await row.getByRole('button',{name:'Give to Agent',exact:true}).click();const dialog=ctx.page.getByRole('dialog');const text=await dialog.locator('pre').innerText();
 if(installed?.state==='installed'){ctx.assert('Installed Skill handoff uses its actual managed path',text.includes(installed.installedPath),true);ctx.assert('Already installed Skill avoids redundant installation',!text.includes(' ensure '),true);}else{ctx.assert('Uninstalled or outdated Skill uses idempotent ensure',text.includes('colab-skill-tool')&&text.includes('ensure'),true);ctx.assert('Handoff identifies the selected shared Skill',text.includes('colab://channel/'+encodeURIComponent(resource(ctx,'channel').name)+'/'+encodeURIComponent(parameter(ctx,'skillName'))),true);}await ctx.screenshot('Skill consumption handoff');
}

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["skillName", "skillRef"]}};

import {core,resource} from "../../../../support/client.mjs";
