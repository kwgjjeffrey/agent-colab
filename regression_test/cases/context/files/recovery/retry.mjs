export const USECASE = {
  "name": "Retry failed file synchronization",
  "description": "Purpose: Failures must be recoverable from the visible control.\n\nPreconditions: A disposable share has a simulated temporary upload failure.\n\nActions: Observe the failure, restore connectivity and use Retry.\n\nExpected results: Progress reflects real work, then the share becomes consumable without duplicate registrations."
};

export const META = {
  "id": "context.files.recovery.retry",
  "module": "context/files/recovery",
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
import {isolated,control} from "../../../../support/controls.mjs";
import {fixtures} from "../../../../support/fixtures.mjs";
import {openTab} from "../../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["isolationConfirmed", "isolatedCoreDiscoveryFile", "isolatedClientBaseUrl", "networkControl"]}};
export async function run(ctx){
const target=await isolated(ctx),f=await fixtures(ctx),c=resource(ctx,'channel');await ctx.page.goto(target.baseUrl);await control(ctx,'networkControl','disconnect');let share;try{share=await core(ctx,'POST','/v1/channels/'+c.id+'/files/share',{localPath:f.files},target);await eventually(ctx,'Upload failure is visible',()=>core(ctx,'GET','/v1/channels/'+c.id+'/files',undefined,target),rows=>rows.some(x=>x.id===share.id&&x.syncState==='failed'),{timeoutMs:30000});}finally{await control(ctx,'networkControl','connect');}try{await openTab(ctx,'Files');const row=ctx.page.locator('div.group').filter({hasText:share.name});await row.getByRole('button',{name:'Retry',exact:true}).click();const rows=await eventually(ctx,'Retry publishes real bytes',()=>core(ctx,'GET','/v1/channels/'+c.id+'/files',undefined,target),rows=>rows.some(x=>x.id===share.id&&x.currentRootOid),{timeoutMs:90000});ctx.assert('Retry did not duplicate registration',rows.filter(x=>x.id===share.id).length,1);}finally{if(share)await core(ctx,'DELETE','/v1/files/'+share.id,undefined,target);}
}
