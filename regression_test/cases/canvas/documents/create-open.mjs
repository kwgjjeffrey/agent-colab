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
  "testLevel": "end-to-end"
};

import {openTab} from "../../../support/gui.mjs";
import {parameter,resource,core,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";
export const REQUIREMENTS={"channel": {"permission": "read"}};
export async function run(ctx){const doc=await createDocument(ctx);try{await ctx.page.getByRole('tab',{name:'Messages',exact:true}).click();await ctx.page.getByRole('tab',{name:'Canvas',exact:true}).click();await ctx.page.locator('[data-trace-region="canvas-tree"]').getByText(doc.title,{exact:true}).click();ctx.assert('Created document can be reopened',await ctx.page.getByText(doc.title,{exact:true}).first().isVisible(),true);}finally{await deleteDocument(ctx,doc);}}
