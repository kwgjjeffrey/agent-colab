export const USECASE = {
  "name": "Reuse threads within a Channel and isolate other Channels",
  "description": "Purpose: Persistent Agent memory must follow the intended collaboration boundary.\n\nPreconditions: One test Agent participates in two disposable Channels.\n\nActions: Issue two related commands in A and an independent command in B.\n\nExpected results: A resumes its existing provider thread; B uses a different thread and does not inherit A conversation history."
};

export const META = {
  "id": "agents.delivery.thread-binding",
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

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}, "parameters": {"keys": ["secondDisposableChannelId"]}};
export async function run(ctx){
const a=resource(ctx,'agent'),otherId=parameter(ctx,'secondDisposableChannelId');await core(ctx,'PATCH','/v1/channels/'+otherId+'/blueprints/'+a.id+'/selection',{enabled:true});const first=await invoke(ctx);await complete(ctx,first);const second=await invoke(ctx);await complete(ctx,second);const otherCtx={...ctx,resources:{...ctx.resources,channel:{...resource(ctx,'channel'),id:otherId}}};const third=await invoke(otherCtx);await complete(otherCtx,third);async function thread(task){const events=await eventually(ctx,'Provider thread events are available',()=>core(ctx,'GET','/v1/agent-requests/'+task.request.id+'/events',undefined,{capture:false}),v=>v.events.some(e=>e.params?.threadId),{timeoutMs:20000});return events.events.find(e=>e.params?.threadId)?.params.threadId;}const ids=await Promise.all([thread(first),thread(second),thread(third)]);ctx.assert('Each request identifies a real provider thread',ids.every(Boolean),true);ctx.assert('Channel A resumes the same thread',ids[0],ids[1]);ctx.assert('Other Channel uses a separate thread',ids[2]!==ids[0],true);
}
