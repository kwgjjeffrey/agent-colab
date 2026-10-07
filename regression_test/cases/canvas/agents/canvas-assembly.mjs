export const USECASE = {
  "name": "Inspect the assembled Canvas command prompt",
  "description": "Purpose: Canvas prompt context has different boundaries from Messages.\n\nPreconditions: A fixture Canvas has named Heading sections and one Agent mention.\n\nActions: Insert the real GUI Agent mention in one of two Heading sections, then invoke the Agent from that section and inspect the captured prompt and labels.\n\nExpected results: The exact document ref, full mention and containing Heading context are included; read precedes optional patch guidance and no raw CRDT is exposed.\n\nAdditional checks: The full visible mention and that containing section are submitted; the other section is not substituted."
};

export const META = {
  "id": "agents.prompts.canvas-assembly",
  "module": "canvas/agents",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src",
    "desktop/ui/src/features/canvas",
    "skills/colab/bin/colab-canvas"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}};
export async function run(ctx){
const d=await createDocument(ctx),a=resource(ctx,'agent');try{const editor=ctx.page.locator('[contenteditable="true"]');await editor.fill('');await editor.press('ControlOrMeta+Alt+1');await editor.pressSequentially('TARGET_SECTION');await editor.press('Enter');await editor.pressSequentially('Reply REGRESSION_OK. @'+a.name.split(' ')[0]);await ctx.page.getByRole('button').filter({has:ctx.page.getByText(a.name,{exact:true})}).click();await editor.press('End');await editor.press('Enter');await editor.press('ControlOrMeta+Alt+1');await editor.pressSequentially('OTHER_SECTION');await editor.press('Enter');await editor.pressSequentially('DO_NOT_SUBSTITUTE_THIS_SECTION');await editor.getByText('@'+a.name,{exact:true}).click();await ctx.page.getByRole('button',{name:'Send to Agent',exact:true}).click();const dialog=ctx.page.getByRole('dialog');const prompt=await dialog.locator('pre').innerText();ctx.assert('Exact Canvas reference is assembled',prompt.includes(d.id),true);ctx.assert('Containing Heading is used',prompt.includes('TARGET_SECTION'),true);ctx.assert('Other Heading is not substituted',!prompt.includes('DO_NOT_SUBSTITUTE_THIS_SECTION'),true);ctx.assert('CRDT internals remain private',!/(?:Y\.Doc|Uint8Array|yrs::)/.test(prompt),true);ctx.assert('Read instructions precede mutation instructions',prompt.indexOf('read')>=0&&prompt.indexOf('read')<prompt.indexOf('patch'),true);await ctx.screenshot('Assembled Canvas Agent prompt');await dialog.getByRole('button',{name:'Send to Agent',exact:true}).click();const requests=await eventually(ctx,'Canvas creates actual Agent request',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/agent-requests'),rows=>rows.some(r=>r.sourceCanvasId===d.id));const request=requests.find(r=>r.sourceCanvasId===d.id);await eventually(ctx,'Real Canvas Agent completes',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/agent-requests'),rows=>rows.some(r=>r.id===request.id&&r.state==='succeeded'),{timeoutMs:180000});}finally{await deleteDocument(ctx,d);}
}
