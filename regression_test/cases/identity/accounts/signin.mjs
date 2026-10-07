export const USECASE = {
  "name": "Complete device sign-in and return to Colab",
  "description": "Purpose: The first usable collaboration session depends on this boundary.\n\nPreconditions: A signed-out test installation has two real device-linked identities.\n\nActions: Select the intended linked identity in the supported device sign-in flow and return to the GUI.\n\nExpected results: The authenticated identity is shown and usable Channels load; unselected identities do not grant an active session. Google account linking is a separate provider boundary, not covered by this device-login case."
};

export const META = {
  "id": "identity.accounts.signin",
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
    "server/standalone/src"
  ],
  "suite": "release",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 78337451bcf8: Real isolated device chooser signs into expected identity and loads navigation; finally restores login. Does not qualify Google linking."
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated} from "../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["isolationConfirmed", "isolatedClientBaseUrl", "isolatedCoreDiscoveryFile", "testIdentityEmail"]}};
export async function run(ctx){
 const target=await isolated(ctx);const before=await core(ctx,'GET','/v1/auth/status',undefined,target);ctx.assert('Fixture has a real linked identity',!!before.user,true);await core(ctx,'POST','/v1/auth/logout',undefined,target);
 try{await ctx.page.goto(target.baseUrl);const choice=ctx.page.getByRole('button',{name:before.user.displayName,exact:true});await choice.waitFor();await choice.click();await eventually(ctx,'Real device sign-in completes',()=>core(ctx,'GET','/v1/auth/status',undefined,target),v=>v.user?.id===before.user.id);await ctx.page.locator('[aria-label="Channels"]').waitFor();ctx.assert('Authenticated Channel navigation loads',await ctx.page.locator('[aria-label="Channels"]').isVisible(),true);}finally{await core(ctx,'POST','/v1/auth/device/login',{userId:before.user.id},target);}
}
