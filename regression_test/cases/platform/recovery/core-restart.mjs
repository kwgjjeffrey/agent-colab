export const USECASE = {
  "name": "Restart Local Core and recover GUI readiness",
  "description": "Purpose: Operational recovery is a real user-facing capability.\n\nPreconditions: A disposable installation has an active GUI session.\n\nActions: Invoke restart and wait for readiness while observing connection state.\n\nExpected results: The GUI reports actual restart progress and recovers without pretending readiness early."
};

export const META = {
  "id": "platform.recovery.core-restart",
  "module": "platform/recovery",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
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
const target=await isolated(ctx);await ctx.page.goto(target.baseUrl);const before=await core(ctx,'GET','/v1/auth/status',undefined,target);await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();await ctx.page.getByRole('button',{name:/Restart.*Core/i}).click();await eventually(ctx,'Managed Core becomes ready again',async()=>{try{return await core(ctx,'GET','/v1/status',undefined,target);}catch{return null;}},v=>!!v,{timeoutMs:60000});ctx.assert('Account survives restart',(await core(ctx,'GET','/v1/auth/status',undefined,target)).user.id,before.user.id);await ctx.page.reload();ctx.assert('GUI recovers its navigation',await ctx.page.getByRole('tab',{name:'Messages',exact:true}).isVisible(),true);
}
