export const USECASE = {
  "name": "Create and reopen a Canvas document",
  "description": "Purpose: Canvas provides a durable shared working surface.\n\nPreconditions: A disposable Channel and authorized test member exist.\n\nActions: Create a Canvas, edit its title, navigate away and reopen it.\n\nExpected results: One persistent document with the intended title appears in the resource tree and opens correctly."
};

export const META = {
  "id": "canvas.documents.create-open",
  "module": "canvas/documents",
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
  "desktop/ui/src/features/canvas",
  "skills/colab/bin/colab-canvas",
  "desktop/ui/src/features/workspace"
],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed October 9 IA migration: exact mixed-item GUI actions, real Core/Server readback, captured traces where enabled and owned cleanup verified; run evidence in docs/validation-plan.md.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:canvas.collection"
  ]
};

import {openTab} from "../../../support/gui.mjs";
import {parameter,resource,core,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";
export const REQUIREMENTS={"channel": {"permission": "read"}};
export async function run(ctx){
 const doc=await createDocument(ctx);
 try{
  const title=doc.title+' renamed',marker='REOPEN_'+ctx.runId;
  const item=()=>ctx.page.locator(`[data-item-id="${doc.id}"][data-item-kind="canvas"]`);
  await item().dblclick();const input=ctx.page.getByRole('textbox',{name:'Item name',exact:true});await input.fill(title);await input.press('Enter');
  const editor=ctx.page.locator('[contenteditable="true"]');await editor.fill(marker);
  await eventually(ctx,'Edited title and body are durable',()=>core(ctx,'GET','/v1/canvases/'+doc.id+'/document'),v=>v.content.includes(marker));
  const rows=await eventually(ctx,'Inline rename persists on the actual document',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/canvases'),rows=>rows.find(x=>x.id===doc.id)?.title===title);ctx.assert('Edited title belongs to the created document',rows.find(x=>x.id===doc.id)?.title,title);
  await ctx.page.getByRole('button',{name:'Message',exact:true}).click();await item().click();
  await ctx.page.locator('nav[aria-label="breadcrumb"]').getByText(title,{exact:true}).waitFor();await editor.waitFor();
  ctx.assert('Reopened editor contains the persisted document body',(await editor.innerText()).includes(marker),true);
 }finally{await deleteDocument(ctx,doc);}
}
