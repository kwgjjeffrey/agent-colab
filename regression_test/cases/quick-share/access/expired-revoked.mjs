export const USECASE = {
  "name": "Deny new consumption after expiry or revocation",
  "description": "Purpose: Capability revocation must enforce the promised boundary.\n\nPreconditions: Disposable capabilities exist for one short-lived and one revocable share.\n\nActions: Let one expire and revoke the other, then attempt new receives.\n\nExpected results: Both new fetches fail clearly; already downloaded copies are not claimed to be remotely erased.\n\nVariations: report each object type or failure condition independently. Reset its isolated fixture between variations; an earlier failure must not suppress later results."
};

export const META = {
  "id": "quick-share.permissions.expired-revoked",
  "module": "quick-share/access",
  "surface": "skill",
  "priority": "critical",
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
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {ownedFiles} from "../../../support/fixtures.mjs";
import {createTransfer,receiveTransfer,revokeTransfer} from "../../../support/transfers.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}};
export async function run(ctx){
const expired=await createTransfer(ctx,{kind:'files',sourcePath:await ownedFiles(ctx),name:'Expired '+ctx.runId},300);const revoked=await createTransfer(ctx,{kind:'files',sourcePath:await ownedFiles(ctx),name:'Revoked '+ctx.runId},3600);await revokeTransfer(ctx,revoked.transferId);const denied=await receiveTransfer(ctx,revoked.capability,{expectFailure:true});ctx.assert('Revocation denies new consumption',/HTTP (403|404|410)/.test(denied.error),true);await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(expired.expiresAt)-Date.now())+2000));const late=await receiveTransfer(ctx,expired.capability,{expectFailure:true});ctx.assert('Expiry denies new consumption',/HTTP (403|404|410)/.test(late.error),true);
}
