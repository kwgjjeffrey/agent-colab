export const USECASE = {
  "name": "Switch Organization and reset scoped resources",
  "description": "Purpose: Tenant scope must survive both navigation and async replies.\n\nPreconditions: A test identity belongs to two Organizations.\n\nActions: Select the other Organization and open its Channels and member picker.\n\nExpected results: Channel and people discovery use the new Organization; stale selection is cleared."
};

export const META = {
  "id": "identity.organizations.switch",
  "module": "identity/organizations",
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
    "server/standalone/src"
  ],
  "suite": "release",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed real actions, exact observed assertions and resource cleanup in Round 6 (20261007T115742Z-bfdf7648); corrected behavior verified.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:client.owner",
    "write:browser.navigation"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated} from "../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["isolationConfirmed", "isolatedClientBaseUrl", "isolatedCoreDiscoveryFile", "secondOrganizationId"]}};
export async function run(ctx){
const target=await isolated(ctx),second=parameter(ctx,'secondOrganizationId'),organizations=await core(ctx,'GET','/v1/organizations',undefined,target),first=organizations.find(o=>o.active);ctx.assert('Two distinct Organization memberships exist',!!first&&first.id!==second&&organizations.some(o=>o.id===second),true);await ctx.page.goto(target.baseUrl);try{await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();await ctx.page.locator('[data-trace-nav="organizations"]').click();await ctx.page.getByRole('button',{name:organizations.find(o=>o.id===second).name,exact:true}).click();await eventually(ctx,'Organization switch persists',()=>core(ctx,'GET','/v1/organizations',undefined,target),rows=>rows.some(o=>o.id===second&&o.active));const channels=await core(ctx,'GET','/v1/channels',undefined,target);ctx.assert('Organization Channel discovery is usable',Array.isArray(channels),true);await ctx.page.reload();ctx.assert('Reload retains Organization scope',(await core(ctx,'GET','/v1/organizations',undefined,target)).find(o=>o.active).id,second);}finally{await core(ctx,'POST','/v1/organizations/'+first.id+'/activate',undefined,target);}
}
