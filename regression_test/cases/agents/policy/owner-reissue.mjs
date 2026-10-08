export const USECASE = {
  "name": "Reissue an authorized owner command through a reply",
  "description": "Purpose: Owner authorization must create a concrete new instruction.\n\nPreconditions: A non-owner request was rejected by Ask me first.\n\nActions: Owner replies with revised instructions and mentions their Agent.\n\nExpected results: A new request uses the owner's full reply as query and the reply chain as context; the rejected request stays rejected."
};

export const META = {
  "id": "agents.policy.owner-reissue",
  "module": "agents/policy",
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
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "20261007T124601Z-dcff5e91 on confirmed Core 0.1.92: non-owner rejection, real owner reply execution, exact assembled prompt, preserved rejected request and policy/membership cleanup all verified.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:client.member",
    "write:membership.fixture",
    "write:runtime.bound",
    "write:agent.blueprint",
    "read:client.owner"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {messageBody} from "../../../support/controls.mjs";
import {invoke,complete,actualPrompt} from "../../../support/agent.mjs";
import {openTab} from "../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}, "parameters": {"keys": ["disposable", "secondMemberCoreDiscoveryFile"]}};
import {withOtherMember} from '../../../support/controls.mjs';
export async function run(ctx){
return withOtherMember(ctx,async()=>{
disposable(ctx);const c=resource(ctx,'channel'),a=resource(ctx,'agent'),other={discoveryFile:parameter(ctx,'secondMemberCoreDiscoveryFile')};const before=(await core(ctx,'GET','/v1/channels/'+c.id+'/blueprints')).find(x=>x.id===a.id);try{await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+a.id,{...before,invocationPolicy:'awaiting_owner'});const original=await core(ctx,'POST','/v1/channels/'+c.id+'/messages',messageBody('NON_OWNER_'+ctx.runId,{mentions:[a]}),other);await eventually(ctx,'Original request is rejected',()=>core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests'),rows=>rows.some(r=>r.triggerMessageId===original.id&&r.state==='rejected'));await openTab(ctx,'Messages');await ctx.page.locator('#message-'+original.id).getByRole('button',{name:/^Quote /}).click();const task=await invoke(ctx,{gui:true});await complete(ctx,task);ctx.assert('Owner instruction preserves reply context',task.message.replyToMessageId,original.id);const prompt=await actualPrompt(ctx,task.request);ctx.assert('Assembled prompt includes full owner reply',prompt.includes('REGRESSION_OK')&&prompt.includes('NON_OWNER_'+ctx.runId),true);ctx.assert('Rejected request remains rejected',(await core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests')).find(r=>r.triggerMessageId===original.id).state,'rejected');}finally{await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+a.id,before);}
});
}
