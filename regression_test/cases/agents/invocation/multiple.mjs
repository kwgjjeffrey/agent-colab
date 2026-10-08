export const USECASE = {
  "name": "Route distinct mentions once per Agent",
  "description": "Purpose: One user action may fan out to multiple independently owned Agents.\n\nPreconditions: Two authorized test Agents participate in a disposable Channel.\n\nActions: Mention each Agent and repeat one mention in the same message.\n\nExpected results: Each distinct blueprint receives one independent request; repeated mentions do not duplicate work."
};

export const META = {
  "id": "agents.invocation.multiple",
  "module": "agents/invocation",
  "surface": "gui",
  "priority": "normal",
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
  "statusReason": "20261007T123745Z-b3537470: actual GUI committed message includes repeated mention; exactly two independent requests and real Codex result replies succeed for both blueprints; temporary blueprint cleanup verified.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:runtime.bound",
    "read:agent.blueprint",
    "read:client.owner",
    "read:browser.navigation"
  ]
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {openTab} from "../../../support/gui.mjs";import {complete} from "../../../support/agent.mjs";
export async function run(ctx){
const c=resource(ctx,'channel'),a=resource(ctx,'agent');const b=await core(ctx,'POST','/v1/channels/'+c.id+'/blueprints',{name:'Regression Fanout '+ctx.runId,loadingInstruction:'Follow the regression request and report through its reply tool.',runtimeId:a.runtimeId,invocationPolicy:'process'});try{await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+b.id+'/selection',{enabled:true});const prior=new Set((await core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests')).map(r=>r.id));await openTab(ctx,'Messages');const editor=ctx.page.getByLabel('Message '+c.name,{exact:true});for(const [index,target]of [a,b,a].entries()){if(index===0){await editor.fill('');await editor.pressSequentially('@'+target.name.split(' ')[0]);}else await editor.pressSequentially(' @'+target.name.split(' ')[0]);await ctx.page.locator('form').getByRole('button').filter({has:ctx.page.getByText(target.name,{exact:true})}).click();await editor.press('End');}const query=' Reply with REGRESSION_OK. Do not change files or contact anyone. '+ctx.runId;await editor.pressSequentially(query);const response=ctx.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/channels/'+c.id+'/messages');await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();const reply=await response;ctx.assert('Fanout message is durably accepted',reply.ok(),true);const message=await reply.json();ctx.assert('Committed message contains both intended blueprints',message.body.includes(a.name)&&message.body.includes(b.name),true);const requests=await eventually(ctx,'Two independent requests exist',()=>core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests'),rows=>rows.filter(r=>!prior.has(r.id)&&r.triggerMessageId===message.id).length>=2);const tasks=requests.filter(r=>!prior.has(r.id)&&r.triggerMessageId===message.id);ctx.assert('Repeated mention does not duplicate the request',tasks.length,2);for(const target of [a,b]){const request=tasks.find(r=>r.targetBlueprintId===target.id);ctx.assert('Each blueprint has its own request',!!request,true);await complete(ctx,{message,request,agent:target,channel:c});}}finally{await core(ctx,'DELETE','/v1/channels/'+c.id+'/blueprints/'+b.id);}
}

export const REQUIREMENTS={channel:{permission:"read"},agent:{state:"online",capability:"execute"}};
