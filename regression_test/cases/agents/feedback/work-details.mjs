export const USECASE = {
  "name": "Inspect actual Agent work and persisted results",
  "description": "Purpose: Human supervision needs faithful work evidence.\n\nPreconditions: A real test Agent executes a uniquely identified command and returns a request-bound result.\n\nActions: Open the work drawer and inspect its state and transcript.\n\nExpected results: The selected task exposes its actual persisted runtime events and its exact result survives reload; full tool logs stay in the work view. Runtime failure rendering is a separate contract, not inferred from successful execution."
};

export const META = {
  "id": "agents.feedback.work-details",
  "module": "agents/feedback",
  "surface": "gui",
  "priority": "normal",
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
  "testLevel": "end-to-end",
  "statusReason": "Repaired script reviewed for resource ownership; awaiting current execution qualification.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:runtime.bound",
    "read:agent.blueprint",
    "read:client.owner",
    "write:browser.navigation"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {invoke,complete} from "../../../support/agent.mjs";
import {openTab} from "../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}};
export async function run(ctx){
const task=await invoke(ctx,{gui:true});await complete(ctx,task);await ctx.page.getByRole('button').filter({hasText:task.agent.name}).filter({hasText:/tasks/}).click();const pop=ctx.page.getByLabel('Agent tasks');const matching=pop.getByRole('button').filter({hasText:task.message.body.replace('@'+task.agent.name+' ','')});if(await matching.count()===1)await matching.click();else await pop.getByRole('button').first().click();const work=ctx.page.locator('[data-trace-region="agent-work"]');await work.waitFor();ctx.assert('Work view exposes the intended Agent',(await work.innerText()).includes(task.agent.name),true);const events=await eventually(ctx,'Work events finish persistence',()=>core(ctx,'GET','/v1/agent-requests/'+task.request.id+'/events',undefined,{capture:false}),v=>v.events.length>0,{timeoutMs:20000});ctx.assert('Persisted work contains real runtime events',events.events.length>0,true);await ctx.screenshot('Real Agent work details');const replies=await core(ctx,'GET','/v1/channels/'+task.channel.id+'/messages?after='+task.message.seq+'&limit=200');const reply=replies.find(m=>m.senderBlueprintId===task.agent.id&&m.replyToMessageId===task.message.id&&m.body.includes('REGRESSION_OK'));ctx.assert('Persisted result belongs to this request',Boolean(reply),true);await ctx.page.reload();await openTab(ctx,'Messages');const result=ctx.page.locator('#message-'+reply.id);await result.waitFor();ctx.assert('Result survives reload',(await result.innerText()).includes('REGRESSION_OK'),true);
}
