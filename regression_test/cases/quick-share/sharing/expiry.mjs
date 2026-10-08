export const USECASE = {
  "name": "Change a managed Quick Share expiry",
  "description": "Purpose: Capability lifetime is a managed permission boundary.\n\nPreconditions: An owned disposable Quick Share and a second unauthorized actor exist.\n\nActions: Update its expiry from management controls, then attempt the same update as the other actor.\n\nExpected results: The owner sees the persisted deadline; unauthorized changes fail and no Channel membership is granted."
};

export const META = {
  "id": "quick-share.management.expiry",
  "module": "quick-share/sharing",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "trial",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "20261007T124601Z-dcff5e91: GUI expiry update is persisted; actual unrelated actor lacks local management receipt and is denied with the supported 400 contract; capability is revoked in cleanup.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:client.member"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {ownedFiles} from "../../../support/fixtures.mjs";
import {openTab} from "../../../support/gui.mjs";
import {createTransfer,revokeTransfer} from "../../../support/transfers.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondMemberCoreDiscoveryFile"]}};
export async function run(ctx){
const t=await createTransfer(ctx,{kind:'files',sourcePath:await ownedFiles(ctx),name:'Expiry '+ctx.runId});try{await openTab(ctx,'Messages');await ctx.page.getByRole('button',{name:'Add',exact:true}).click();await ctx.page.getByRole('menuitem',{name:'Quick Share',exact:true}).hover();await ctx.page.getByRole('menuitem',{name:'Manage shared items',exact:true}).click();await ctx.page.getByRole('dialog').getByRole('button').filter({hasText:'Expiry '+ctx.runId}).click();await ctx.page.getByLabel('Expires after').fill('2');const response=ctx.page.waitForResponse(r=>r.url().endsWith('/v1/transfers/'+t.transferId)&&r.request().method()==='PATCH');await ctx.page.getByRole('button',{name:'Update expiry',exact:true}).click();const result=await (await response).json();ctx.assert('Owner expiry is persisted',Math.abs(Date.parse(result.expiresAt)-Date.now()-7200000)<15000,true);const denied=await core(ctx,'PATCH','/v1/transfers/'+t.transferId,{expiresInSeconds:3600},{discoveryFile:parameter(ctx,'secondMemberCoreDiscoveryFile'),expectFailure:true,capture:false});ctx.assert('Other actor cannot change lifetime',/HTTP (403|404)/.test(denied.error)||(/HTTP 400/.test(denied.error)&&denied.error.includes('Active Quick Share receipt was not found')),true);}finally{await revokeTransfer(ctx,t.transferId);}
}
