export const USECASE = {
  "name": "Create a blueprint bound to an owned runtime",
  "description": "Purpose: The executable participant must have a real owner and destination.\n\nPreconditions: An available owned Codex runtime and disposable test configuration exist.\n\nActions: Create a blueprint with instructions, Skills and invocation policy, then add it to a Channel.\n\nExpected results: The selected owned runtime and blueprint are persisted; missing or foreign runtime selection is rejected."
};

export const META = {
  "id": "agents.configuration.blueprint",
  "module": "agents/configuration",
  "surface": "gui",
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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 1b37c749432e: GUI creates owned runtime-bound blueprint; instruction, identity and participation read back; invalid runtime rejected and owned blueprint removed.",
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
import {openTab} from "../../../support/gui.mjs";
export async function run(ctx){
const c=resource(ctx,'channel'),a=resource(ctx,'agent');const name='Regression Blueprint '+ctx.runId;await openTab(ctx,'Messages');await ctx.page.locator('[data-trace-nav="agents.manager"]').click();const dialog=ctx.page.getByRole('dialog',{name:'Agents',exact:true});await dialog.getByRole('button',{name:'Create manually',exact:true}).click();const form=dialog.locator('form');await form.locator('[name="name"]').fill(name);await form.locator('[name="loadingInstruction"]').fill('REGRESSION_INSTRUCTION_'+ctx.runId);const runtimes=await core(ctx,'GET','/v1/channels/'+c.id+'/agent-runtimes');const runtime=runtimes.find(r=>r.id===a.runtimeId);ctx.assert('Bound runtime is owned and online',!!runtime&&runtime.available,true);await form.getByRole('combobox').first().click();await ctx.page.getByRole('option',{name:runtime.deviceName+' · Codex',exact:true}).click();await form.getByRole('button',{name:'Create and add',exact:true}).click();const rows=await eventually(ctx,'Blueprint is persisted',()=>core(ctx,'GET','/v1/channels/'+c.id+'/blueprints'),rows=>rows.some(r=>r.name===name&&r.inChannel));const created=rows.find(r=>r.name===name);try{ctx.assert('Runtime identity is persisted',created.runtimeId,a.runtimeId);ctx.assert('Instruction is persisted',created.loadingInstruction,'REGRESSION_INSTRUCTION_'+ctx.runId);ctx.assert('Blueprint participates in this Channel',created.inChannel,true);await core(ctx,'POST','/v1/channels/'+c.id+'/blueprints',{name:name+' invalid',runtimeId:crypto.randomUUID()},{expectFailure:true});}finally{await core(ctx,'DELETE','/v1/channels/'+c.id+'/blueprints/'+created.id);}
}

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}};
