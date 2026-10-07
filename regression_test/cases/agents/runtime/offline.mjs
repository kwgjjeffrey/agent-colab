export const USECASE = {
  "name": "Recover an authorized command after runtime reconnect",
  "description": "Purpose: Offline delivery and real execution have different meanings.\n\nPreconditions: A disposable Agent runtime is offline and the owner is authorized.\n\nActions: Submit a command, inspect its state, reconnect the runtime and observe completion.\n\nExpected results: Offline explanation is visible; command is retained and delivered without duplicate execution; delivering does not masquerade as running.\n\nAdditional checks: The blueprint remains identifiable while runtime availability changes; unavailable work is not labeled running."
};

export const META = {
  "id": "agents.delivery.offline",
  "module": "agents/runtime",
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

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {invoke,complete} from "../../../support/agent.mjs";
import {control} from "../../../support/controls.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["isolationConfirmed", "runtimeControl"]}};
export async function run(ctx){
if(parameter(ctx,'isolationConfirmed')!==true)ctx.block('Only a disposable runtime may be disconnected');await control(ctx,'runtimeControl','disconnect');try{const task=await invoke(ctx);const pending=(await core(ctx,'GET','/v1/channels/'+task.channel.id+'/agent-requests')).find(x=>x.id===task.request.id);ctx.assert('Offline request does not claim runtime execution',!['running','succeeded'].includes(pending.state),true);await control(ctx,'runtimeControl','connect');await complete(ctx,task);const rows=await core(ctx,'GET','/v1/channels/'+task.channel.id+'/agent-requests');ctx.assert('Reconnect retains one request for the trigger',rows.filter(x=>x.triggerMessageId===task.message.id).length,1);}finally{await control(ctx,'runtimeControl','connect');}
}
