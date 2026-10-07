export const USECASE = {
  "name": "Check artifact updates without modifying installation",
  "description": "Purpose: Users need a trustworthy preview before updating.\n\nPreconditions: A test installation and controlled channel manifest exist.\n\nActions: Use Check updates and inspect component versions and update proposal.\n\nExpected results: Each artifact is compared independently; checking does not install and errors are explicit."
};

export const META = {
  "id": "platform.updates.check",
  "module": "platform/updates",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [],
  "affectedPaths": [
    "skills/colab/setup",
    "desktop/ui/src/features/updates"
  ],
  "suite": "release",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated} from "../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["isolationConfirmed", "isolatedCoreDiscoveryFile", "isolatedClientBaseUrl"]}};
export async function run(ctx){
const target=isolated(ctx);await ctx.page.goto(target.baseUrl);const before=await core(ctx,'GET','/v1/system/installation',undefined,target);await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();const response=ctx.page.waitForResponse(r=>r.url().includes('/v1/system/installation?refresh=true'));await ctx.page.getByRole('button',{name:'Check updates',exact:true}).click();const proposal=await (await response).json();ctx.assert('Check independently reports each component',['local-core','desktop-ui','colab-skill','electron-shell'].every(k=>!!proposal.components[k]),true);const after=await core(ctx,'GET','/v1/system/installation',undefined,target);ctx.assert('Check does not change installed versions',after.componentVersions,before.componentVersions);
}
