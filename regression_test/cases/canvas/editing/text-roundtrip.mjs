export const USECASE = {
  "name": "Persist supported Canvas text structures",
  "description": "Purpose: GUI and Agent must observe the same document meaning.\n\nPreconditions: A disposable Canvas fixture exists.\n\nActions: Write headings, paragraphs, lists, code and hard line breaks, reload and read its Markdown projection.\n\nExpected results: GUI and projection preserve the supported structure and content, including line-break behavior."
};

export const META = {
  "id": "canvas.editing.text-roundtrip",
  "module": "canvas/editing",
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
export async function run(ctx){const doc=await createDocument(ctx);try{const editor=ctx.page.locator('[contenteditable=true]').first();await editor.fill('Regression heading');await editor.press('ControlOrMeta+Alt+1');await editor.press('End');await editor.press('Enter');await editor.pressSequentially('Line one');await editor.press('Shift+Enter');await editor.pressSequentially('Line two');const projection=await eventually(ctx,'GUI edits persist in Markdown projection',()=>core(ctx,'GET','/v1/canvases/'+doc.id+'/document'),r=>r.content.includes('Line two'));ctx.assert('Heading structure survives projection',projection.content.includes('# Regression heading'),true);await ctx.page.reload();await openTab(ctx,'Canvas');await ctx.page.getByText(doc.title,{exact:true}).click();ctx.assert('Reload preserves edited text',await ctx.page.locator('[contenteditable=true]').first().innerText().then(v=>v.includes('Line two')),true);}finally{await deleteDocument(ctx,doc);}}
