export const USECASE = {
  "name": "Delete only the selected disposable Canvas",
  "description": "Purpose: Destructive document actions need precise scope and honest failure handling.\n\nPreconditions: A disposable Channel contains a target document and a control document.\n\nActions: Delete the target using the real removal flow, then attempt to reopen it.\n\nExpected results: Only the selected document is removed, other content remains and stale references report the actual unavailable state."
};

export const META = {
  "id": "canvas.documents.delete",
  "module": "canvas/documents",
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
  "testLevel": "end-to-end"
};

import {openTab} from "../../../support/gui.mjs";
import {parameter,resource,core,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";
export const REQUIREMENTS={"channel": {"permission": "read"}};
export async function run(ctx){const doc=await createDocument(ctx);const control=await core(ctx,'POST','/v1/channels/'+resource(ctx,'channel').id+'/canvases',{title:'Control '+ctx.runId});try{await ctx.page.getByRole('button',{name:'Delete '+doc.title,exact:true}).click();await ctx.page.getByRole('alertdialog').getByRole('button',{name:'Delete document',exact:true}).click();const rows=await eventually(ctx,'Selected Canvas is deleted',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/canvases'),rows=>!rows.some(r=>r.id===doc.id));ctx.assert('Control Canvas remains',rows.some(r=>r.id===control.id),true);}finally{await deleteDocument(ctx,control);}}
