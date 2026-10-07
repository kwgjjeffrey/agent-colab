export const USECASE = {
  "name": "Recover Canvas edits after offline restart",
  "description": "Purpose: Local durability is essential when the network fails.\n\nPreconditions: A disposable Canvas has been loaded and Local Core can be restarted safely.\n\nActions: Edit while offline, restart Core, then restore the connection.\n\nExpected results: Durable queued changes survive, upload in order and converge; the GUI shows pending versus synced accurately."
};

export const META = {
  "id": "canvas.recovery.outbox",
  "module": "canvas/sync",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
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
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated,control} from "../../../support/controls.mjs";
import {createDocument} from "../../../support/canvas.mjs";
import {openTab} from "../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["isolationConfirmed", "isolatedCoreDiscoveryFile", "isolatedClientBaseUrl", "networkControl", "coreControl"]}};
export async function run(ctx){
const target=isolated(ctx);await ctx.page.goto(target.baseUrl);const d=await createDocument(ctx);try{await control(ctx,'networkControl','disconnect');await ctx.page.locator('[contenteditable="true"]').fill('DURABLE_'+ctx.runId);await ctx.page.getByText(/Pending|Saving/i).waitFor();await control(ctx,'coreControl','restart');await ctx.page.reload();await openTab(ctx,'Canvas');await ctx.page.locator('[data-trace-region="canvas-tree"]').getByText(d.title,{exact:true}).click();ctx.assert('Unsent edit survives Core restart',(await ctx.page.locator('[contenteditable="true"]').innerText()).includes('DURABLE_'+ctx.runId),true);await control(ctx,'networkControl','connect');await eventually(ctx,'Outbox uploads the durable edit',()=>core(ctx,'GET','/v1/canvases/'+d.id+'/document',undefined,target),v=>v.content.includes('DURABLE_'+ctx.runId)&&v.syncState==='synced',{timeoutMs:60000});}finally{await control(ctx,'networkControl','connect');await core(ctx,'DELETE','/v1/canvases/'+d.id,undefined,target);}
}
