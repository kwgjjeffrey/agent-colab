export const USECASE = {
  "name": "Withdraw a Session through Browser",
  "description": "Purpose: Session sharing has the same contributor-control contract as Files.\n\nPreconditions: An owned Session share and a second test member exist.\n\nActions: Withdraw the item by reference, then retry discovery and new reading as the member.\n\nExpected results: The item is withdrawn and new remote consumption is denied without affecting unrelated shares."
};

export const META = {
  "id": "context.sessions.sharing.withdraw",
  "module": "context/sessions/sharing",
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
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 222a3700e8a8: Independent real Session first read then withdrawn via Skill; subsequent consumer read denied."
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../../support/client.mjs";
export async function run(ctx) {
disposable(ctx);const c=resource(ctx,'channel'),source=await ownedSession(ctx);const share=await core(ctx,'POST','/v1/channels/'+c.id+'/sessions/share',{sourcePath:source,sourceAdapter:'codex-jsonl-v1',name:'Withdraw Session '+ctx.runId});const ref='colab://channel/'+c.id+'/'+share.id;const second={discoveryFile:parameter(ctx,'secondCoreDiscoveryFile')};await core(ctx,'POST','/v1/sessions/'+share.id+'/read',{turnLimit:1},second);await cli(ctx,'colab-browser',['withdraw','--item',ref]);const after=await core(ctx,'POST','/v1/sessions/'+share.id+'/read',{turnLimit:1},{...second,expectFailure:true});ctx.assert('Withdrawn Session denies fresh remote consumption',/HTTP (403|404)/.test(after.error),true);
}

export const REQUIREMENTS={channel:{permission:"read"},parameters:{keys:["disposable","secondCoreDiscoveryFile"]}};

import {ownedSession} from "../../../../support/fixtures.mjs";
