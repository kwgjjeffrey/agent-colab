export const USECASE = {
  "name": "Reject a stale or unmatched Canvas patch atomically",
  "description": "Purpose: Concurrency must not silently corrupt agent-authored changes.\n\nPreconditions: A document projection has changed since a test Agent read it.\n\nActions: Apply a patch whose contextual text no longer matches.\n\nExpected results: The operation reports the conflict and leaves the document unchanged rather than applying a partial guessed edit."
};

export const META = {
  "id": "canvas.editing.stale-patch",
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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 9592b36cdcb1: Actual unmatched contextual patch exits nonzero and full document projection remains unchanged.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:canvas.collection",
    "write:canvas.fixture"
  ]
};

import {invoke,complete} from "../../../support/agent.mjs";
import {parameter,resource,core,cli,data,disposable} from "../../../support/client.mjs";
export async function run(ctx){disposable(ctx);const ref=parameter(ctx,'canvasRef');const before=data(await cli(ctx,'colab-canvas',['read','--ref',ref]));const patch='*** Begin Patch\n*** Update File: document.md\n@@\n-nonexistent-'+ctx.runId+'\n+should-not-appear\n*** End Patch\n';const result=await ctx.command('Reject stale Canvas patch','python3',['skills/colab/bin/colab-canvas','apply-patch','--ref',ref],{input:patch});ctx.assert('Unmatched contextual patch fails',result.code!==0,true);const after=data(await cli(ctx,'colab-canvas',['read','--ref',ref]));ctx.assert('Failed patch preserves document',after.content,before.content);}

export const REQUIREMENTS={"parameters": {"keys": ["canvasRef"]}};
