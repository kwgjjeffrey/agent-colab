export const USECASE = {
  "name": "Write request-scoped Agent replies safely",
  "description": "Purpose: Agent output must not impersonate people or duplicate feedback.\n\nPreconditions: A test Agent has one request with a known trigger and requester.\n\nActions: Report a reply through the request-scoped tool and retry its nonce.\n\nExpected results: One reply has the fixed blueprint sender, authoritative requester mention and trigger link; arbitrary sender or reply target cannot be chosen."
};

export const META = {
  "id": "agents.feedback.reply",
  "module": "agents/feedback",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "trial",
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

import {invoke,complete} from "../../../support/agent.mjs";
import {parameter,resource,core,cli,data,disposable} from "../../../support/client.mjs";
export async function run(ctx){const task=await invoke(ctx);await complete(ctx,task);const rows=await core(ctx,'GET','/v1/channels/'+task.channel.id+'/messages?after='+task.message.seq+'&limit=200');const reply=rows.find(m=>m.senderBlueprintId===task.agent.id&&m.body.includes('REGRESSION_OK'));ctx.assert('Reply points to the triggering message',reply.replyToMessageId,task.message.id);ctx.assert('Reply sender is fixed to the blueprint',reply.senderBlueprintId,task.agent.id);const body={message:'Nonce feedback '+ctx.runId,clientNonce:crypto.randomUUID(),senderMemberId:crypto.randomUUID(),replyToMessageId:crypto.randomUUID()};const first=await core(ctx,'POST','/v1/agent-requests/'+task.request.id+'/reply',body);const second=await core(ctx,'POST','/v1/agent-requests/'+task.request.id+'/reply',body);ctx.assert('Agent reply nonce is idempotent',first.id,second.id);ctx.assert('Caller cannot override blueprint sender',first.senderBlueprintId,task.agent.id);ctx.assert('Caller cannot override trigger link',first.replyToMessageId,task.message.id);}

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}};
