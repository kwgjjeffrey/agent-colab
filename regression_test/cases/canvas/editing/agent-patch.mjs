export const USECASE = {
  "name": "Apply a textual Canvas patch through the Skill",
  "description": "Purpose: Agent edits must use the same durable document boundary.\n\nPreconditions: An authorized disposable Canvas and its current projection are available.\n\nActions: Read through colab-canvas, then apply a small contextual patch.\n\nExpected results: Only the intended text changes, the GUI converges, and the agent receives plain Markdown without CRDT internals."
};

export const META = {
  "id": "canvas.editing.agent-patch",
  "module": "canvas/editing",
  "surface": "skill",
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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source fa6159373629: Real Skill patch exact projection comparison; finally reverses patch and confirms full original projection restored."
};

import {invoke,complete} from "../../../support/agent.mjs";
import {parameter,resource,core,cli,data,disposable} from "../../../support/client.mjs";
export async function run(ctx){
 disposable(ctx);const ref=parameter(ctx,'canvasRef'),before=data(await cli(ctx,'colab-canvas',['read','--ref',ref]));const old=parameter(ctx,'canvasOldText'),next='regression-'+ctx.runId;ctx.assert('Patch fixture exists in projection',before.content.includes(old),true);
 const patch=(from,to)=>'*** Begin Patch\n*** Update File: document.md\n@@\n-'+from+'\n+'+to+'\n*** End Patch\n';let changed=false;
 try{const result=await ctx.command('Canvas apply patch','python3',['skills/colab/bin/colab-canvas','apply-patch','--ref',ref],{input:patch(old,next)});ctx.assert('Canvas patch command succeeded',result.code,0);changed=true;const after=data(await cli(ctx,'colab-canvas',['read','--ref',ref]));ctx.assert('Only the selected projection text changes',after.content,before.content.replace(old,next));ctx.assert('Agent receives plain Markdown',typeof after.content,'string');}
 finally{if(changed){const restore=await ctx.command('Restore owned Canvas fixture','python3',['skills/colab/bin/colab-canvas','apply-patch','--ref',ref],{input:patch(next,old)});ctx.assert('Owned fixture is restored for repeated regression',restore.code,0);const restored=data(await cli(ctx,'colab-canvas',['read','--ref',ref]));ctx.assert('Restored projection matches the prior fixture',restored.content,before.content);}}
}

export const REQUIREMENTS={"parameters": {"keys": ["canvasOldText", "canvasRef"]}};
