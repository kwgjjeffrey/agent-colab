export const USECASE = {
  "name": "Read cached Session history while offline",
  "description": "Purpose: Network failure must not unnecessarily erase usable working context.\n\nPreconditions: A Session revision is already cached on the consuming device.\n\nActions: Disconnect only the isolated test client transport and read the Session again.\n\nExpected results: Usable cached turns are returned with explicit freshness; unavailable history is not fabricated."
};

export const META = {
  "id": "context.sessions.recovery.cached-read",
  "module": "context/sessions/recovery",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "trial",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Revalidating contributor/recipient distinction after independent local previews; receiver-created share exercises the consumer cache.",
  "locks": [
  "read:client.primary",
  "write:channel.shared",
  "write:client.owner",
  "write:transport.owner",
  "write:session.fixture",
  "write:client.receiver",
  "write:browser.loopback-auth"
]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {isolated,control} from "../../../../support/controls.mjs";

export const REQUIREMENTS={channel:{permission:'read'},"parameters": {"keys": ["sessionSourcePath", "secondCoreDiscoveryFile", "disposable", "isolationConfirmed", "isolatedCoreDiscoveryFile", "isolatedClientBaseUrl", "networkControl"]}};
export async function run(ctx){
disposable(ctx);const target=await isolated(ctx),producer={discoveryFile:parameter(ctx,'secondCoreDiscoveryFile')};let share;
try{
 share=await core(ctx,'POST',`/v1/channels/${resource(ctx,'channel').id}/sessions/share`,{sourcePath:parameter(ctx,'sessionSourcePath'),sourceAdapter:'codex-jsonl-v1',name:'Consumer cache '+ctx.runId},producer);
 await core(ctx,'POST',`/v1/sessions/${share.id}/sync`,undefined,producer);
 const before=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:20},target);
 ctx.assert('Consumer reads committed cache rather than producer local preview',before.freshness?.cache,'current');
 await control(ctx,'networkControl','disconnect');
 const after=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:20},target);
 ctx.assert('Cached turns remain usable',JSON.stringify(after.turns),JSON.stringify(before.turns));
 ctx.assert('Offline freshness is explicit',after.freshness?.cache,'stale');
}finally{await control(ctx,'networkControl','connect');if(share)await core(ctx,'DELETE',`/v1/sessions/${share.id}`,undefined,producer);}
}
