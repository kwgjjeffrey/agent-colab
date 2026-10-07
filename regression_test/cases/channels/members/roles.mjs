export const USECASE = {
  "name": "Enforce member roles on Channel management",
  "description": "Purpose: Hiding a management control is insufficient authorization.\n\nPreconditions: A disposable Channel contains an owner and a restricted member.\n\nActions: Change the member role and attempt Channel settings and member management from that account.\n\nExpected results: Allowed actions match the persisted role; restricted requests fail at the server as well as the GUI."
};

export const META = {
  "id": "collaboration.members.roles",
  "module": "channels/members",
  "surface": "gui",
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
import {openTab} from "../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondMemberEmail", "secondMemberCoreDiscoveryFile", "thirdMemberEmail"]}};
export async function run(ctx){
const c=resource(ctx,'channel'),email=parameter(ctx,'secondMemberEmail'),second=parameter(ctx,'secondMemberCoreDiscoveryFile');await core(ctx,'POST','/v1/channels/'+c.id+'/members',{email,role:'member'});const member=(await core(ctx,'GET','/v1/channels/'+c.id+'/members')).find(m=>m.email===email);try{await openTab(ctx,'Settings');const target=ctx.page.locator('div.divide-y > div').filter({hasText:email});await target.waitFor();ctx.assert('Configured member row is unique',await target.count(),1);for(const [role,label]of [['admin','Admin'],['member','Member']]){await target.getByRole('combobox').click();await ctx.page.getByRole('option',{name:label,exact:true}).click();await eventually(ctx,'Persist role '+role,()=>core(ctx,'GET','/v1/channels/'+c.id+'/members'),rows=>rows.some(m=>m.memberId===member.memberId&&m.role===role));}const denied=await core(ctx,'PATCH','/v1/channels/'+c.id,{name:'UNAUTHORIZED_'+ctx.runId}, {discoveryFile:second,expectFailure:true});ctx.assert('Restricted member cannot manage Channel',/HTTP 403/.test(denied.error),true);const invite=await core(ctx,'POST','/v1/channels/'+c.id+'/members',{email:parameter(ctx,'thirdMemberEmail'),role:'admin'},{discoveryFile:second,expectFailure:true});ctx.assert('Restricted member cannot grant membership',/HTTP 403/.test(invite.error),true);}finally{await core(ctx,'DELETE','/v1/channels/'+c.id+'/members/'+member.memberId);}
}
