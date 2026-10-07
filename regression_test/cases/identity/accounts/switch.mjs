export const USECASE = {
  "name": "Switch accounts without leaking previous context",
  "description": "Purpose: Account isolation is a trust boundary, not just a navigation action.\n\nPreconditions: Two test accounts have disjoint Channels and cached resources.\n\nActions: Switch from account A to B, inspect navigation, then return to A.\n\nExpected results: Only the selected account's Channels, members and cached context are presented; late A responses cannot populate B.\n\nAdditional checks: Only the active account can update its timeline and activity indicators."
};

export const META = {
  "id": "identity.accounts.switch",
  "module": "identity/accounts",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "local/src",
    "server/standalone/src",
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated} from "../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["isolationConfirmed", "isolatedClientBaseUrl", "isolatedCoreDiscoveryFile", "secondAccountId"]}};
export async function run(ctx){
const target=await isolated(ctx),accounts=await core(ctx,'GET','/v1/auth/accounts',undefined,target),second=parameter(ctx,'secondAccountId');const first=accounts.find(x=>x.active);ctx.assert('Both real accounts are saved',!!first&&accounts.some(x=>x.userId===second),true);const firstChannels=await core(ctx,'GET','/v1/channels',undefined,target);await ctx.page.goto(target.baseUrl);try{await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();await ctx.page.locator('[data-trace-nav="accounts"]').click();await ctx.page.getByRole('button').filter({hasText:accounts.find(x=>x.userId===second).email}).click();const switched=await eventually(ctx,'Active account changes',()=>core(ctx,'GET','/v1/auth/accounts',undefined,target),rows=>rows.some(x=>x.active&&x.userId===second));const secondChannels=await core(ctx,'GET','/v1/channels',undefined,target);for(const channel of firstChannels.filter(a=>!secondChannels.some(b=>a.id===b.id)))ctx.assert('Old account navigation is absent',await ctx.page.getByRole('button',{name:channel.name,exact:true}).count(),0);await ctx.page.reload();ctx.assert('Current account remains selected after reload',(await core(ctx,'GET','/v1/auth/accounts',undefined,target)).find(x=>x.active).userId,second);}finally{await core(ctx,'POST','/v1/auth/switch',{userId:first.userId},target);}
}
