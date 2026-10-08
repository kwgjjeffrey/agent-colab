export const USECASE = {
  "name": "Remove a blueprint from a Channel or delete it",
  "description": "Purpose: Configuration removal must preserve historical meaning and ownership scope.\n\nPreconditions: A disposable owned blueprint belongs to two test Channels.\n\nActions: Remove it from one Channel, then delete the blueprint through its owner controls.\n\nExpected results: Channel removal affects only that participation; deletion removes the owned blueprint and prevents future routing without rewriting old message history.\n\nVariations: report each object type or failure condition independently. Reset its isolated fixture between variations; an earlier failure must not suppress later results."
};

export const META = {
  "id": "agents.configuration.remove",
  "module": "agents/configuration",
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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source f1126d6718a5: Real runtime executes and replies before GUI deselection/deletion; other Channel participation and retained history are checked, retired selection is denied.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:runtime.bound",
    "read:agent.blueprint",
    "read:client.owner",
    "read:browser.navigation"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {invoke,complete} from "../../../support/agent.mjs";
import {openTab} from "../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}, "parameters": {"keys": ["disposable", "secondDisposableChannelId"]}};
export async function run(ctx){
disposable(ctx);const c=resource(ctx,'channel'),second=parameter(ctx,'secondDisposableChannelId');const blueprint=await core(ctx,'POST','/v1/channels/'+c.id+'/blueprints',{name:'Disposable '+ctx.runId,loadingInstruction:'Execute the regression request without side effects. Report the requested REGRESSION_OK marker through the provided reply tool.',runtimeId:resource(ctx,'agent').runtimeId,invocationPolicy:'process'});await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+blueprint.id+'/selection',{enabled:true});ctx.assert('First Channel initially has the blueprint',(await core(ctx,'GET','/v1/channels/'+c.id+'/blueprints')).some(x=>x.id===blueprint.id&&x.inChannel),true);await core(ctx,'PATCH','/v1/channels/'+second+'/blueprints/'+blueprint.id+'/selection',{enabled:true});const task=await invoke(ctx,{agent:blueprint,query:'Use the supplied colab-messages request reply command to send REGRESSION_OK to the Channel. Do not merely return a final answer. Do not change files or contact anyone else.'});await complete(ctx,task);const history=(await core(ctx,'GET','/v1/channels/'+c.id+'/messages?after='+task.message.seq+'&limit=200')).find(m=>m.senderBlueprintId===blueprint.id&&m.replyToMessageId===task.message.id&&m.body.includes('REGRESSION_OK'));ctx.assert('Disposable blueprint has actual history before removal',!!history,true);await openTab(ctx,'Messages');await ctx.page.locator('[data-trace-nav="agents.manager"]').click();const dialog=ctx.page.getByRole('dialog');const row=dialog.getByRole('button',{name:blueprint.name,exact:true}).locator('..');ctx.assert('Removal control initially reflects participation',await row.getByRole('checkbox').getAttribute('aria-checked'),'true');await row.getByRole('checkbox').click();await eventually(ctx,'First Channel participation is removed',()=>core(ctx,'GET','/v1/channels/'+c.id+'/blueprints'),rows=>rows.some(x=>x.id===blueprint.id&&!x.inChannel));ctx.assert('Second Channel retains participation',(await core(ctx,'GET','/v1/channels/'+second+'/blueprints')).some(x=>x.id===blueprint.id&&x.inChannel),true);await row.getByRole('button',{name:blueprint.name,exact:true}).click();await dialog.getByRole('button',{name:'Remove Agent',exact:true}).click();await eventually(ctx,'Owned blueprint is deleted',()=>core(ctx,'GET','/v1/channels/'+second+'/blueprints'),rows=>!rows.some(x=>x.id===blueprint.id));const after=(await core(ctx,'GET','/v1/channels/'+c.id+'/messages?after='+task.message.seq+'&limit=200')).find(m=>m.id===history.id);ctx.assert('Blueprint deletion preserves its real result history',{body:after?.body,senderBlueprintId:after?.senderBlueprintId},{body:history.body,senderBlueprintId:history.senderBlueprintId});ctx.assert('Deleted blueprint cannot be selected',(await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+blueprint.id+'/selection',{enabled:true},{expectFailure:true})).ok,false);
}
