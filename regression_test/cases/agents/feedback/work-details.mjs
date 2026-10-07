export const USECASE = {
  "name": "Inspect actual Agent work and failures",
  "description": "Purpose: Human supervision needs faithful work evidence.\n\nPreconditions: A controlled test command produces progress, output and a failure.\n\nActions: Open the work drawer and inspect its state and transcript.\n\nExpected results: Accepted execution, progress and error are distinguishable; complete tool logs are not broadcast as ordinary messages."
};

export const META = {
  "id": "agents.feedback.work-details",
  "module": "agents/feedback",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "rotten",
  "effects": "read-only",
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
  "statusReason": "Review found assertion coverage gap: script invokes successful execution only, but USECASE promises progress and failure distinction. Add controlled real runtime failure and drawer assertions before reactivation."
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {invoke,complete} from "../../../support/agent.mjs";
import {openTab} from "../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}};
export async function run(ctx){
const task=await invoke(ctx,{gui:true});await complete(ctx,task);await ctx.page.getByRole('button').filter({hasText:task.agent.name}).filter({hasText:/tasks/}).click();const pop=ctx.page.getByLabel('Agent tasks');await pop.getByRole('button').first().click();const work=ctx.page.locator('[data-trace-region="agent-work"]');await work.waitFor();ctx.assert('Work view exposes the intended Agent',(await work.innerText()).includes(task.agent.name),true);const events=await eventually(ctx,'Work events finish persistence',()=>core(ctx,'GET','/v1/agent-requests/'+task.request.id+'/events',undefined,{capture:false}),v=>v.events.length>0,{timeoutMs:20000});ctx.assert('Persisted work contains real runtime events',events.events.length>0,true);await ctx.screenshot('Real Agent work details');const replies=await core(ctx,'GET','/v1/channels/'+task.channel.id+'/messages?after='+task.message.seq+'&limit=200');const reply=replies.find(m=>m.senderBlueprintId===task.agent.id&&m.replyToMessageId===task.message.id&&m.body.includes('REGRESSION_OK'));ctx.assert('Persisted result belongs to this request',Boolean(reply),true);await ctx.page.reload();await openTab(ctx,'Messages');const result=ctx.page.locator('#message-'+reply.id);await result.waitFor();ctx.assert('Result survives reload',(await result.innerText()).includes('REGRESSION_OK'),true);
}
