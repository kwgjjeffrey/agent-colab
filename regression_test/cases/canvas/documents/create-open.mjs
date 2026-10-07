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
    "skills/colab/bin/colab-canvas"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Round 12 20261007T122018Z-9daf491a: durable edited title verified by document ID, actual editor body persists across navigation, and owned document cleanup verified."
};

import {openTab} from "../../../support/gui.mjs";
import {parameter,resource,core,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";
export const REQUIREMENTS={"channel": {"permission": "read"}};
export async function run(ctx){const doc=await createDocument(ctx);try{const title=doc.title+' renamed',marker='REOPEN_'+ctx.runId;await ctx.page.getByRole('heading',{name:doc.title,exact:true}).dblclick();const input=ctx.page.locator('section header input');await input.fill(title);await input.press('Enter');const editor=ctx.page.locator('[contenteditable="true"]');await editor.fill(marker);await eventually(ctx,'Edited title and body are durable',()=>core(ctx,'GET','/v1/canvases/'+doc.id+'/document'),v=>v.content.includes(marker));const rows=await core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/canvases');ctx.assert('Edited title belongs to the created document',rows.find(x=>x.id===doc.id)?.title,title);await ctx.page.getByRole('tab',{name:'Messages',exact:true}).click();await ctx.page.getByRole('tab',{name:'Canvas',exact:true}).click();await ctx.page.locator('[data-trace-region="canvas-tree"]').getByText(title,{exact:true}).click();await ctx.page.getByRole('heading',{name:title,exact:true}).waitFor();await editor.waitFor();ctx.assert('Reopened editor contains the persisted document body',(await editor.innerText()).includes(marker),true);}finally{await deleteDocument(ctx,doc);}}
