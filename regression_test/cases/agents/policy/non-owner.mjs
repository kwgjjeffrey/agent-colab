export const USECASE = {
  "name": "Enforce Ask me first and Refuse policies",
  "description": "Purpose: Remote execution authority must match the actual product policy.\n\nPreconditions: Owner and non-owner test members and controllable Agent policies exist.\n\nActions: Have the non-owner mention the Agent under each restrictive policy.\n\nExpected results: Both requests terminate rejected; Ask me first explains owner re-issue, Refuse does not execute; no fictitious approval queue appears."
};

export const META = {
  "id": "agents.policy.non-owner",
  "module": "agents/policy",
  "surface": "integration",
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
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {messageBody} from "../../../support/controls.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}, "parameters": {"keys": ["disposable", "secondMemberCoreDiscoveryFile"]}};
import {withOtherMember} from '../../../support/controls.mjs';
export async function run(ctx){
return withOtherMember(ctx,async()=>{
disposable(ctx);const c=resource(ctx,'channel'),a=resource(ctx,'agent'),other={discoveryFile:parameter(ctx,'secondMemberCoreDiscoveryFile')};const before=(await core(ctx,'GET','/v1/channels/'+c.id+'/blueprints')).find(x=>x.id===a.id);try{for(const policy of ['awaiting_owner','refuse']){await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+a.id,{...before,invocationPolicy:policy});const message=await core(ctx,'POST','/v1/channels/'+c.id+'/messages',messageBody('NON_OWNER_'+ctx.runId,{mentions:[a]}),other);const rows=await eventually(ctx,'Non-owner instruction terminates rejected',()=>core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests'),rows=>rows.some(r=>r.triggerMessageId===message.id&&r.state==='rejected'));ctx.assert('No execution was started',!rows.find(r=>r.triggerMessageId===message.id).startedAt,true);}}finally{await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+a.id,before);}
});
}
