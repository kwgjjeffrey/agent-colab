export const USECASE = {
  "name": "Converge concurrent Canvas edits from two clients",
  "description": "Purpose: Shared editing needs convergence beyond a single successful save.\n\nPreconditions: Two authorized clients open the same disposable Canvas.\n\nActions: Make non-conflicting edits from each client and reconnect both.\n\nExpected results: Both edits persist and both clients converge to the same projection without repeated insertion."
};

export const META = {
  "id": "canvas.realtime.convergence",
  "module": "canvas/sync",
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
    "desktop/ui/src/features/canvas",
    "skills/colab/bin/colab-canvas"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed real actions, exact observed assertions and resource cleanup in Round 6 (20261007T115742Z-bfdf7648); corrected behavior verified.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:client.receiver",
    "write:canvas.collection"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";
import {openTab} from "../../../support/gui.mjs";
import {secondary} from "../../../support/controls.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondClientBaseUrl"]}};
export async function run(ctx){
const d=await createDocument(ctx),c=resource(ctx,'channel'),other=await secondary(ctx);try{await other.locator('[aria-label="Channels"]').getByRole('button',{name:c.name,exact:true}).click();await other.locator('[aria-label="Channel items"]').getByText(d.title,{exact:true}).click();const first=ctx.page.locator('[contenteditable="true"]'),second=other.locator('[contenteditable="true"]');await first.fill('EDIT_A_'+ctx.runId);await second.press('End');await second.pressSequentially(' EDIT_B_'+ctx.runId);const projection=await eventually(ctx,'Both real clients converge',()=>core(ctx,'GET','/v1/canvases/'+d.id+'/document'),x=>x.content?.includes('EDIT_A_'+ctx.runId)&&x.content?.includes('EDIT_B_'+ctx.runId),{timeoutMs:30000});ctx.assert('First edit is not duplicated',projection.content.split('EDIT_A_'+ctx.runId).length-1,1);ctx.assert('Second edit is not duplicated',projection.content.split('EDIT_B_'+ctx.runId).length-1,1);await ctx.page.reload();await other.reload();await openTab(ctx,'Canvas');await ctx.page.locator('[aria-label="Channel items"]').getByText(d.title,{exact:true}).click();await other.locator('[aria-label="Channel items"]').getByText(d.title,{exact:true}).click();ctx.assert('Both rendered projections agree',await first.innerText(),await second.innerText());}finally{await other.close();await deleteDocument(ctx,d);}
}
