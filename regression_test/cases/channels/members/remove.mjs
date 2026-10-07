export const USECASE = {
  "name": "Remove a member and revoke subsequent access",
  "description": "Purpose: Revocation must take effect beyond a removed row in the GUI.\n\nPreconditions: An owner and a second test member share a disposable Channel.\n\nActions: Remove the member through colab-browser, then attempt new reads as the removed member.\n\nExpected results: Membership disappears and future protected reads fail; other members retain access."
};

export const META = {
  "id": "collaboration.members.remove",
  "module": "channels/members",
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
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["disposable", "secondMemberEmail", "secondMemberCoreDiscoveryFile"]}};
export async function run(ctx){
disposable(ctx);const c=resource(ctx,'channel'),email=parameter(ctx,'secondMemberEmail'),second=parameter(ctx,'secondMemberCoreDiscoveryFile');await core(ctx,'POST','/v1/channels/'+c.id+'/members',{email,role:'member'});const member=(await core(ctx,'GET','/v1/channels/'+c.id+'/members')).find(m=>m.email===email);ctx.assert('Test collaborator is present',!!member,true);await cli(ctx,'colab-browser',['remove-member','--channel','colab://channel/'+c.id,'--user',member.memberId]);const denied=await core(ctx,'GET','/v1/channels/'+c.id+'/messages',undefined,{discoveryFile:second,expectFailure:true});ctx.assert('Removed member is denied at service boundary',/HTTP (403|404)/.test(denied.error),true);ctx.assert('Owner retains access',Array.isArray(await core(ctx,'GET','/v1/channels/'+c.id+'/members')),true);
}
