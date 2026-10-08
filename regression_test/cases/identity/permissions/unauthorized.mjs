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
  "testLevel": "end-to-end",
  "statusReason": "Latest scoped round 20261007T123407Z-b23e54a6: existing protected resources remain readable to owner and reject actual other identity with 403/404 across Messages, Files materialization, Session and Canvas reads.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:client.member",
    "read:membership.fixture"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondMemberCoreDiscoveryFile", "privateResourceRoutes"]}};
export async function run(ctx){
const second=parameter(ctx,'secondMemberCoreDiscoveryFile'),c=resource(ctx,'channel');for(const entry of [{method:'GET',path:'/v1/channels/'+c.id+'/messages'},...parameter(ctx,'privateResourceRoutes')]){const route=typeof entry==='string'?{method:'GET',path:entry}:entry;if(!route.path||!['GET','POST'].includes(route.method)||(route.method==='POST'&&!/\/(read|materialize)$/.test(route.path)))ctx.block('Permission fixtures must use real read endpoints');await core(ctx,route.method,route.path,route.body,{capture:false});const denied=await core(ctx,route.method,route.path,route.body,{discoveryFile:second,expectFailure:true,capture:false});ctx.assert('Existing protected resource denies the other actor: '+route.path,/HTTP (403|404)/.test(denied.error),true);}
}
