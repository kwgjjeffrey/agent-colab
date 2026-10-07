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
  "testLevel": "end-to-end"
};

import {invoke,complete} from "../../../support/agent.mjs";
import {parameter,resource,core,cli,data,disposable} from "../../../support/client.mjs";
export async function run(ctx){disposable(ctx);const ref=parameter(ctx,'canvasRef'),before=data(await cli(ctx,'colab-canvas',['read','--ref',ref]));const old=parameter(ctx,'canvasOldText'),next='regression-'+ctx.runId;ctx.assert('Patch fixture exists in projection',before.content.includes(old),true);const patch='*** Begin Patch\n*** Update File: document.md\n@@\n-'+old+'\n+'+next+'\n*** End Patch\n';const result=await ctx.command('Canvas apply patch','python3',['skills/colab/bin/colab-canvas','apply-patch','--ref',ref],{input:patch});ctx.assert('Canvas patch command succeeded',result.code,0);const after=data(await cli(ctx,'colab-canvas',['read','--ref',ref]));ctx.assert('Projection includes the patched content',after.content.includes(next),true);}

export const REQUIREMENTS={"parameters": {"keys": ["canvasOldText", "canvasRef"]}};
