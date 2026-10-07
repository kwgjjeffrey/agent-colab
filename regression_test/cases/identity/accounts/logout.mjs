export const USECASE = {
  "name": "Sign out and clear authenticated views",
  "description": "Purpose: Leaving a session must end its usable authority and visible account scope.\n\nPreconditions: A disposable signed-in session has cached Channel and context data.\n\nActions: Sign out, reopen authenticated views and attempt a new protected operation.\n\nExpected results: The session is signed out, previous account context is not presented and new protected requests require authorization."
};

export const META = {
  "id": "identity.accounts.logout",
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
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated} from "../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["isolationConfirmed", "isolatedClientBaseUrl", "isolatedCoreDiscoveryFile"]}};
export async function run(ctx){
const target=isolated(ctx);await ctx.page.goto(target.baseUrl);const before=await core(ctx,'GET','/v1/auth/status',undefined,target);ctx.assert('Isolated fixture starts signed in',before.signedIn??before.authenticated,true);await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();await ctx.page.getByRole('button',{name:/Sign out/i}).click();const status=await eventually(ctx,'Isolated session becomes signed out',()=>core(ctx,'GET','/v1/auth/status',undefined,target),v=>!(v.signedIn??v.authenticated));ctx.assert('Previous identity is cleared',!status.user,true);const denied=await core(ctx,'GET','/v1/channels',undefined,{...target,expectFailure:true});ctx.assert('Protected operation requires authorization',/HTTP 401/.test(denied.error),true);await ctx.page.reload();ctx.assert('Sign-in action is visible',await ctx.page.getByRole('button',{name:/Sign in/i}).isVisible(),true);
}
