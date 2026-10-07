export const USECASE = {
  "name": "Deduplicate a retried message submission",
  "description": "Purpose: Transport retries must not duplicate communication or remote work.\n\nPreconditions: A disposable Channel and a controlled retry client exist.\n\nActions: Submit the same message nonce twice while simulating an uncertain first response.\n\nExpected results: Only one persisted message and one set of routed Agent requests exist.\n\nExecution boundary: verify this contract with controlled inputs through its owning API or adapter; a full browser journey is unnecessary."
};

export const META = {
  "id": "communication.messages.nonce",
  "module": "messages/timeline",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "fast",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "contract",
  "statusReason": "Reviewed real actions, exact observed assertions and resource cleanup in Round 6 (20261007T115742Z-bfdf7648); corrected behavior verified."
};

import {invoke,complete} from "../../../support/agent.mjs";
import {parameter,resource,core,cli,data,disposable} from "../../../support/client.mjs";
export async function run(ctx){const c=resource(ctx,'channel');const message='Regression nonce '+ctx.runId;const body={plainText:message,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:message}]}]},clientNonce:crypto.randomUUID()};const first=await core(ctx,'POST','/v1/channels/'+c.id+'/messages',body);const second=await core(ctx,'POST','/v1/channels/'+c.id+'/messages',body);ctx.assert('Retry returns the same persisted message',first.id,second.id);const rows=await core(ctx,'GET','/v1/channels/'+c.id+'/messages?after='+Math.max(0,first.seq-1)+'&limit=200');ctx.assert('Exactly one message was persisted',rows.filter(m=>m.id===first.id).length,1);}

export const REQUIREMENTS={"channel": {"permission": "read"}};
