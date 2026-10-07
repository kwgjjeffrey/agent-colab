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
    "local-core",
    "test-agent-runtime"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {openTab} from "../../../support/gui.mjs";import {complete} from "../../../support/agent.mjs";
export async function run(ctx){
const c=resource(ctx,'channel'),a=resource(ctx,'agent');const b=await core(ctx,'POST','/v1/channels/'+c.id+'/blueprints',{name:'Regression Fanout '+ctx.runId,loadingInstruction:'Follow the regression request and report through its reply tool.',runtimeId:a.runtimeId,invocationPolicy:'process'});try{await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+b.id+'/selection',{enabled:true});const prior=new Set((await core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests')).map(r=>r.id));await openTab(ctx,'Messages');const editor=ctx.page.getByLabel('Message '+c.name,{exact:true});for(const [index,target]of [a,b,a].entries()){if(index===0)await editor.fill('@'+target.name);else await editor.pressSequentially(' @'+target.name);await ctx.page.locator('form').getByRole('button',{name:target.name,exact:true}).click();await editor.press('End');}const query=' Reply with REGRESSION_OK. Do not change files or contact anyone. '+ctx.runId;await editor.pressSequentially(query);await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();const messages=await eventually(ctx,'Fanout message is committed',()=>core(ctx,'GET','/v1/channels/'+c.id+'/messages?after=0&limit=200'),rows=>rows.some(m=>m.body.includes(ctx.runId)&&m.senderKind==='human'));const message=messages.find(m=>m.body.includes(ctx.runId)&&m.senderKind==='human');const requests=await eventually(ctx,'Two independent requests exist',()=>core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests'),rows=>rows.filter(r=>!prior.has(r.id)&&r.triggerMessageId===message.id).length>=2);const tasks=requests.filter(r=>!prior.has(r.id)&&r.triggerMessageId===message.id);ctx.assert('Repeated mention does not duplicate the request',tasks.length,2);for(const target of [a,b]){const request=tasks.find(r=>r.targetBlueprintId===target.id);ctx.assert('Each blueprint has its own request',!!request,true);await complete(ctx,{message,request,agent:target,channel:c});}}finally{await core(ctx,'DELETE','/v1/channels/'+c.id+'/blueprints/'+b.id);}
}

export const REQUIREMENTS={channel:{permission:"read"},agent:{state:"online",capability:"execute"}};
