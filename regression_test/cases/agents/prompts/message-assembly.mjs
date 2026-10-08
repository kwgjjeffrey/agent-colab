export const USECASE = {
  "name": "Inspect the exact assembled message command prompt",
  "description": "Purpose: Prompt assembly is a correctness boundary requiring explicit engineering review.\n\nPreconditions: A fixture blueprint, rich mention, reply chain and context refs are known.\n\nActions: Submit one controlled request and inspect its captured assembled prompt and labels.\n\nExpected results: The full user query, requester, blueprint instruction, bounded reply context and tool guidance are present in the intended order; unrelated context and secrets are absent."
};

export const META = {
  "id": "agents.prompts.message-assembly",
  "module": "agents/prompts",
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
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 88412ea5131c: Actual request-specific provider input contains full message, exact blueprint instruction and scoped reply tool; CRDT details absent.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:runtime.bound",
    "read:agent.blueprint",
    "read:client.owner"
  ]
};

import {invoke,complete,actualPrompt} from "../../../support/agent.mjs";
import {parameter,resource,core,cli,data,disposable} from "../../../support/client.mjs";
export async function run(ctx){const task=await invoke(ctx);await complete(ctx,task);const prompt=await actualPrompt(ctx,task.request);ctx.assert('Actual runtime input contains the full triggering message',prompt.includes(task.message.body),true);const agents=await core(ctx,'GET','/v1/channels/'+task.channel.id+'/blueprints');const instruction=agents.find(a=>a.id===task.agent.id).loadingInstruction;ctx.assert('Exact blueprint instruction is included',prompt.includes(instruction),true);ctx.assert('Reply tool is scoped to the request',prompt.includes(task.request.id)&&prompt.includes('request reply'),true);ctx.assert('No CRDT implementation context is leaked',/Yrs|yjs|stateVector|updateV2/.test(prompt),false);}

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}};
