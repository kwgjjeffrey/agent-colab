export const USECASE = {
  "name": "Forward selected context into one Agent request",
  "description": "Purpose: Human curation is a distinct entry from direct Agent mention.\n\nPreconditions: A test conversation contains multiple messages and shared resource capsules.\n\nActions: Select a subset, choose an authorized Agent and inspect the final instruction before sending.\n\nExpected results: Only selected context and the explicit task reach the intended Agent; unselected conversation is not substituted."
};

export const META = {
  "id": "agents.invocation.forward",
  "module": "agents/invocation",
  "surface": "gui",
  "priority": "critical",
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
import {openTab} from "../../../support/gui.mjs";import {complete,actualPrompt} from "../../../support/agent.mjs";
export async function run(ctx){
const c=resource(ctx,'channel'),a=resource(ctx,'agent');const make=text=>core(ctx,'POST','/v1/channels/'+c.id+'/messages',{plainText:text,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]},clientNonce:crypto.randomUUID()});const prior=new Set((await core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests')).map(r=>r.id));const chosen=await make('SELECTED_'+ctx.runId),other=await make('UNSELECTED_'+ctx.runId);await openTab(ctx,'Messages');const row=ctx.page.locator('#message-'+chosen.id);await row.waitFor();await row.getByRole('button',{name:/^Forward /}).click();const dialog=ctx.page.getByRole('dialog',{name:'Forward to Agent',exact:true});await dialog.getByRole('button').filter({hasText:a.name}).click();const query='Reply with REGRESSION_OK. Selected context only. '+ctx.runId;await dialog.getByLabel('Your instruction',{exact:true}).fill(query);ctx.assert('Visible task instruction is exact',await dialog.getByLabel('Your instruction',{exact:true}).inputValue(),query);await dialog.getByRole('button',{name:'Send to Agent',exact:true}).click();const requests=await eventually(ctx,'A forwarded request is created',()=>core(ctx,'GET','/v1/channels/'+c.id+'/agent-requests'),rows=>rows.some(r=>r.targetBlueprintId===a.id&&!prior.has(r.id)));const request=requests.filter(r=>r.targetBlueprintId===a.id&&!prior.has(r.id)).at(-1);await complete(ctx,{message:other,request,agent:a,channel:c});const prompt=await actualPrompt(ctx,request);ctx.assert('Explicit task reaches runtime',prompt.includes(query),true);ctx.assert('Selected context reaches runtime',prompt.includes(chosen.body),true);ctx.assert('Unselected context is absent',prompt.includes(other.body),false);
}

export const REQUIREMENTS={channel:{permission:"read"},agent:{state:"online",capability:"execute"}};
