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
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../../support/client.mjs";
export async function run(ctx) {
disposable(ctx);const ref=parameter(ctx,'sessionRef');const before=await cli(ctx,'colab-session-reader',['read','--ref',ref]);ctx.assert('Fixture is readable before withdrawal',before.ok,true);await cli(ctx,'colab-browser',['withdraw','--item',ref]);const after=await cli(ctx,'colab-browser',['open','--ref',ref],{expectedCode:1});ctx.assert('Withdrawn resource is not discoverable',after.ok,false);
}

export const REQUIREMENTS={"parameters": {"keys": ["sessionRef"]}};
