export const USECASE = {
  "name": "Create and update a Channel through the Skill",
  "description": "Purpose: Agent and human entry points must share business semantics.\n\nPreconditions: A disposable Organization and valid Skill installation are available.\n\nActions: Create a Channel, then update its name and icon using colab-browser.\n\nExpected results: GUI and CLI observe the same authoritative Channel; failed updates preserve the previous values."
};

export const META = {
  "id": "collaboration.channels.create-command",
  "module": "channels/lifecycle",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "trial",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../support/client.mjs";
export async function run(ctx) {
const name='regression-'+ctx.runId;const created=data(await cli(ctx,'colab-browser',['create-channel','--name',name]));ctx.assert('Create command confirms creation',created.created,true);const ref='colab://channel/'+encodeURIComponent(name);const renamed=name+'-renamed';await cli(ctx,'colab-browser',['update-channel','--channel',ref,'--name',renamed]);const listing=data(await cli(ctx,'colab-browser',['open','--ref','colab://']));ctx.assert('Updated Channel is discoverable',listing.some(c=>c.name===renamed),true);
}
