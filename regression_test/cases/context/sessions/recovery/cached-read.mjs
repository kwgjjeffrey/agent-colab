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
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed real actions, exact observed assertions and resource cleanup in Round 6 (20261007T115742Z-bfdf7648); corrected behavior verified."
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {isolated,control} from "../../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["sessionRef", "isolationConfirmed", "isolatedCoreDiscoveryFile", "isolatedClientBaseUrl", "networkControl"]}};
export async function run(ctx){
const target=await isolated(ctx),ref=parameter(ctx,'sessionRef'),id=ref.split('/').pop();const before=await core(ctx,'POST','/v1/sessions/'+id+'/read',{turnLimit:20},target);await control(ctx,'networkControl','disconnect');try{const after=await core(ctx,'POST','/v1/sessions/'+id+'/read',{turnLimit:20},target);ctx.assert('Cached turns remain usable',JSON.stringify(after.turns),JSON.stringify(before.turns));ctx.assert('Offline freshness is explicit',after.freshness?.cache==='stale',true);}finally{await control(ctx,'networkControl','connect');}
}
