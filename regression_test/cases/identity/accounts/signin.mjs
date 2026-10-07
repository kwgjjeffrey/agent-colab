export const USECASE = {
  "name": "Complete browser sign-in and return to Colab",
  "description": "Purpose: The first usable collaboration session depends on this boundary.\n\nPreconditions: A signed-out test installation and a test identity are available.\n\nActions: Start sign-in, finish the supported browser flow, and return to the GUI.\n\nExpected results: The authenticated identity is shown and usable Channels load; cancellation leaves a clear signed-out state."
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
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated} from "../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["isolationConfirmed", "isolatedClientBaseUrl", "isolatedCoreDiscoveryFile", "testIdentityEmail"]}};
export async function run(ctx){
const target=isolated(ctx);await ctx.page.goto(target.baseUrl);await ctx.page.getByRole('button',{name:/Sign in/i}).click();const provider=await core(ctx,'GET','/v1/auth/google/start?login_hint='+encodeURIComponent(parameter(ctx,'testIdentityEmail')),undefined,{...target,capture:false});const authPage=await ctx.page.context().newPage();try{await authPage.goto(provider.authorizationUrl);await authPage.getByText(parameter(ctx,'testIdentityEmail'),{exact:true}).click();await eventually(ctx,'Browser sign-in is completed',()=>core(ctx,'GET','/v1/auth/status',undefined,target),v=>!!v.user,{timeoutMs:120000});await ctx.page.reload();ctx.assert('Signed-in Channel navigation is available',await ctx.page.locator('[aria-label="Channels"]').isVisible(),true);}finally{await authPage.close();}
}
