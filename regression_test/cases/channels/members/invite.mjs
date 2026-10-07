export const USECASE = {
  "name": "Invite a collaborator into the correct Channel",
  "description": "Purpose: Collaboration requires a real, correctly scoped membership grant.\n\nPreconditions: An owner, an existing Organization member and a disposable Channel exist.\n\nActions: Search the member picker, add the member and inspect access from their session.\n\nExpected results: The selected person joins only the intended Channel and can discover its context."
};

export const META = {
  "id": "collaboration.members.invite",
  "module": "channels/members",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
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

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondMemberEmail", "secondCoreDiscoveryFile"]}};
export async function run(ctx){
const c=resource(ctx,'channel'),email=parameter(ctx,'secondMemberEmail'),second=parameter(ctx,'secondCoreDiscoveryFile');const before=await core(ctx,'GET','/v1/channels/'+c.id+'/members');ctx.assert('Invite fixture is not already a member',!before.some(m=>m.email===email),true);await openTab(ctx,'Messages');await ctx.page.getByRole('button',{name:'Add user',exact:true}).click();const d=ctx.page.getByRole('dialog');await d.locator('input[name="email"]').fill(email);await d.getByRole('button',{name:'Add user',exact:true}).click();const rows=await eventually(ctx,'Existing Organization member joins this Channel',()=>core(ctx,'GET','/v1/channels/'+c.id+'/members'),rows=>rows.some(m=>m.email===email));const added=rows.find(m=>m.email===email);try{const accessible=await core(ctx,'GET','/v1/channels',undefined,{discoveryFile:second});ctx.assert('Invited member can discover intended Channel',accessible.some(x=>x.id===c.id),true);}finally{await core(ctx,'DELETE','/v1/channels/'+c.id+'/members/'+added.memberId);}
}
