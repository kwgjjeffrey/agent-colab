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
import {item} from "../../../../support/gui.mjs";
export async function run(ctx){
disposable(ctx);const ref=parameter(ctx,'filesRef'),id=ref.split('/').pop(),second=parameter(ctx,'secondCoreDiscoveryFile');await core(ctx,'POST','/v1/files/'+id+'/materialize',undefined,{discoveryFile:second});const row=await item(ctx,'Files','filesName');await row.getByRole('button',{name:'Withdraw',exact:true}).click();await eventually(ctx,'Files share leaves active discovery',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/files'),rows=>!rows.some(s=>s.id===id));const denied=await core(ctx,'POST','/v1/files/'+id+'/materialize',undefined,{discoveryFile:second,expectFailure:true});ctx.assert('Fresh receiver fetch is denied by authorization',/HTTP (403|404)/.test(denied.error),true);
}
export const REQUIREMENTS={"parameters": {"keys": ["disposable", "filesRef", "filesName", "secondCoreDiscoveryFile"]}};
