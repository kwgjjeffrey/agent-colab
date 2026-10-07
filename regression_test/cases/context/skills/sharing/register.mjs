export const USECASE = {
  "name": "Share a Skill and expose its current root",
  "description": "Purpose: Reusable capabilities are part of the shared-context loop.\n\nPreconditions: A disposable valid Skill directory and Channel exist.\n\nActions: Share it in the GUI and inspect it from a second member's Skill tools.\n\nExpected results: Both entries identify the same current root and compatibility metadata."
};

export const META = {
  "id": "context.skills.sharing.register",
  "module": "context/skills/sharing",
  "surface": "gui",
  "priority": "normal",
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

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {fixtures} from "../../../../support/fixtures.mjs";
import {openTab} from "../../../../support/gui.mjs";
import {withPathSelection} from "../../../../support/selection.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondCoreDiscoveryFile", "nativeChooserBoundary"]}};
export async function run(ctx){
const f=await fixtures(ctx),c=resource(ctx,'channel'),second=parameter(ctx,'secondCoreDiscoveryFile');await openTab(ctx,'Skills');await withPathSelection(ctx,f.skill,async()=>{await ctx.page.getByRole('button',{name:'Share skill',exact:true}).click();await ctx.page.getByRole('dialog').getByRole('button',{name:'Choose Skill folder',exact:true}).click();});const rows=await eventually(ctx,'Skill is shared through GUI',()=>core(ctx,'GET','/v1/channels/'+c.id+'/skills'),rows=>rows.some(s=>s.name==='regression-owned-'+ctx.caseId.replaceAll('.','-')));const share=rows.find(s=>s.name==='regression-owned-'+ctx.caseId.replaceAll('.','-'));try{await eventually(ctx,'Skill has a published root',()=>core(ctx,'GET','/v1/channels/'+c.id+'/skills'),rows=>rows.some(s=>s.id===share.id&&s.currentRootOid),{timeoutMs:90000});const remote=await core(ctx,'GET','/v1/channels/'+c.id+'/skills',undefined,{discoveryFile:second});ctx.assert('Both members identify the same Skill root',remote.find(s=>s.id===share.id)?.currentRootOid,(await core(ctx,'GET','/v1/channels/'+c.id+'/skills')).find(s=>s.id===share.id).currentRootOid);}finally{await core(ctx,'DELETE','/v1/skills/'+share.id);}
}
