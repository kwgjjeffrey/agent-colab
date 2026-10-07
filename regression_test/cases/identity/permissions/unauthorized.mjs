export const USECASE = {
  "name": "Reject access to another Channel's context",
  "description": "Purpose: Discovery filtering alone cannot secure direct resource references.\n\nPreconditions: Two accounts and a private Channel owned by A exist; B has no membership.\n\nActions: As B, open a known A resource URI and attempt Files, Session and Canvas reads.\n\nExpected results: All protected operations deny access with structured errors; no bytes or metadata leak through cached resolution.\n\nVariations: report each object type or failure condition independently. Reset its isolated fixture between variations; an earlier failure must not suppress later results."
};

export const META = {
  "id": "identity.permissions.unauthorized",
  "module": "identity/permissions",
  "surface": "skill",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
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

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondCoreDiscoveryFile", "privateResourceRoutes"]}};
export async function run(ctx){
const second=parameter(ctx,'secondCoreDiscoveryFile'),c=resource(ctx,'channel');for(const route of ['/v1/channels/'+c.id+'/messages',...parameter(ctx,'privateResourceRoutes')]){const denied=await core(ctx,'GET',route,undefined,{discoveryFile:second,expectFailure:true,capture:false});ctx.assert('Protected resource denies direct access: '+route,/HTTP (403|404)/.test(denied.error),true);}
}
