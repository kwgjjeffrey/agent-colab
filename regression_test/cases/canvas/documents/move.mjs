export const USECASE = {
  "name": "Move Canvas documents within the resource tree",
  "description": "Purpose: Document organization must not accidentally change its identity or bytes.\n\nPreconditions: A disposable Channel has folders and several documents.\n\nActions: Move and reorder a document, then reopen from a second client.\n\nExpected results: Tree order and parent persist without losing document content or permitting invalid cyclic folders."
};

export const META = {
  "id": "canvas.documents.move",
  "module": "canvas/documents",
  "surface": "gui",
  "priority": "normal",
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
  "testLevel": "end-to-end",
  "statusReason": "20261007T125006Z-6def5954: real GUI drag sends JSON PATCH, persisted parent and identity verified, independently authenticated receiver waits for and sees moved document, invalid parent rejected and temporary document deleted. Missing Content-Type product defect repaired and verified.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:client.receiver",
    "write:canvas.collection",
    "write:browser.navigation"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";
import {openTab} from "../../../support/gui.mjs";
import {secondary} from "../../../support/controls.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondClientBaseUrl"]}};
export async function run(ctx){
const c=resource(ctx,'channel'),d=await createDocument(ctx),name='Folder '+ctx.runId;const folder=await core(ctx,'POST','/v1/channels/'+c.id+'/canvas-folders',{name});try{await ctx.page.reload();await openTab(ctx,'Canvas');const tree=ctx.page.locator('[data-trace-region="canvas-tree"]');const row=tree.locator('[draggable="true"]').filter({hasText:d.title}),destination=tree.locator('div.group').filter({has:ctx.page.getByText(name,{exact:true})});await row.dragTo(destination);const rows=await eventually(ctx,'Document parent persists',()=>core(ctx,'GET','/v1/channels/'+c.id+'/canvases'),rows=>rows.some(x=>x.id===d.id&&x.folderId===folder.id));ctx.assert('Move preserves document identity',rows.find(x=>x.id===d.id).title,d.title);const other=await secondary(ctx);try{await other.getByRole('button',{name:c.name,exact:true}).click();await other.getByRole('tab',{name:'Canvas',exact:true}).click();const moved=other.locator('[data-trace-region="canvas-tree"]').getByText(d.title,{exact:true});await moved.waitFor({state:'visible',timeout:30000});ctx.assert('Second client discovers the moved document',await moved.count(),1);}finally{await other.close();}const invalid=await core(ctx,'PATCH','/v1/canvases/'+d.id+'/position',{folderId:d.id,index:0},{expectFailure:true});ctx.assert('Invalid parent is rejected',/HTTP (400|403|404|422)/.test(invalid.error),true);}finally{await deleteDocument(ctx,d);}
}
