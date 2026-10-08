import path from 'node:path';
export const USECASE = {
  "name": "Withdraw an owned Files share",
  "description": "Purpose: The product must honestly enforce the contributor's control.\n\nPreconditions: A test Files share is visible to two members.\n\nActions: Withdraw it in the GUI and attempt a new read as the other member.\n\nExpected results: The share leaves active discovery and new fetches are denied; already downloaded copies are not claimed to be erased."
};

export const META = {
  "id": "context.files.sharing.withdraw",
  "module": "context/files/sharing",
  "surface": "gui",
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
  "testLevel": "end-to-end",
  "statusReason": "Reviewed real actions, exact observed assertions and resource cleanup in Round 6 (20261007T115742Z-bfdf7648); corrected behavior verified.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:client.owner",
    "read:client.receiver",
    "read:files.fixture"
  ]
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {item} from "../../../../support/gui.mjs";
import {fixtures} from '../../../../support/fixtures.mjs';
import {shareFiles} from '../../../../support/selection.mjs';
export async function run(ctx){
 disposable(ctx);const f=await fixtures(ctx),c=resource(ctx,'channel'),second=parameter(ctx,'secondCoreDiscoveryFile');const share=await shareFiles(ctx,f.files,path.basename(f.files));const id=share.id;
 await eventually(ctx,'Owned withdrawal fixture is published',()=>core(ctx,'GET','/v1/channels/'+c.id+'/files'),rows=>rows.some(x=>x.id===id&&x.currentRootOid),{timeoutMs:90000});
 await core(ctx,'POST','/v1/files/'+id+'/materialize',undefined,{discoveryFile:second});await ctx.page.locator(`[data-item-id="${share.id}"][data-item-kind="files"]`).click();await ctx.page.getByRole('button',{name:'Give to Agent',exact:true}).waitFor();await ctx.page.getByRole('button',{name:'More item actions',exact:true}).click();await ctx.page.getByRole('menuitem',{name:'Withdraw',exact:true}).click();await eventually(ctx,'Files share leaves active discovery',()=>core(ctx,'GET','/v1/channels/'+c.id+'/files'),rows=>!rows.some(s=>s.id===id));const denied=await core(ctx,'POST','/v1/files/'+id+'/materialize',undefined,{discoveryFile:parameter(ctx,'isolatedCoreDiscoveryFile'),expectFailure:true});ctx.assert('Fresh receiver fetch is denied by authorization',/HTTP (403|404)/.test(denied.error),true);
}
export const REQUIREMENTS={"parameters": {"keys": ["disposable", "secondCoreDiscoveryFile", "isolatedCoreDiscoveryFile"]}};
