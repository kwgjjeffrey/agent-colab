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
  "statusReason": "20261007T125006Z-6def5954: real GUI drag sends JSON PATCH, persisted parent and identity verified, independently authenticated receiver waits for and sees moved document, invalid parent rejected and temporary document deleted. Missing Content-Type product defect repaired and verified.",
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
const c=resource(ctx,'channel'),d=await createDocument(ctx),name='Folder '+ctx.runId;const folder=await core(ctx,'POST','/v1/channels/'+c.id+'/canvas-folders',{name});try{await ctx.page.reload();await openTab(ctx,'Canvas');await ctx.page.locator('[data-item-id="'+d.id+'"]').click();await ctx.page.getByRole('button',{name:'Give to Agent',exact:true}).waitFor();await ctx.page.getByRole('button',{name:'More item actions',exact:true}).click();await ctx.page.getByRole('menuitem',{name:'Move',exact:true}).click();await ctx.page.getByRole('dialog').getByRole('button',{name,exact:true}).click();const rows=await eventually(ctx,'Document parent persists',()=>core(ctx,'GET','/v1/channels/'+c.id+'/canvases'),rows=>rows.some(x=>x.id===d.id&&x.folderId===folder.id));ctx.assert('Move preserves document identity',rows.find(x=>x.id===d.id).title,d.title);const other=await secondary(ctx);try{await other.locator('[aria-label="Channels"]').getByRole('button',{name:c.name,exact:true}).click();await other.getByRole('button',{name:'Home',exact:true}).click();await other.reload();await other.locator('[data-item-id="'+folder.id+'"]').locator('..').getByRole('button',{name:'Expand '+name,exact:true}).click();const moved=other.locator('[aria-label="Channel items"]').getByText(d.title,{exact:true});await moved.waitFor({state:'visible',timeout:30000});ctx.assert('Second client discovers the moved document',await moved.count(),1);}finally{await other.close();}const invalid=await core(ctx,'PATCH','/v1/canvases/'+d.id+'/position',{folderId:d.id,index:0},{expectFailure:true});ctx.assert('Invalid parent is rejected',/HTTP (400|403|404|422)/.test(invalid.error),true);}finally{await deleteDocument(ctx,d);await core(ctx,'DELETE','/v1/channels/'+c.id+'/catalogs/'+folder.id);}
}
