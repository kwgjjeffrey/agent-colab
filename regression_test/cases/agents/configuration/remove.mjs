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
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {openTab} from "../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}, "parameters": {"keys": ["disposable", "secondDisposableChannelId"]}};
export async function run(ctx){
disposable(ctx);const c=resource(ctx,'channel'),second=parameter(ctx,'secondDisposableChannelId');const blueprint=await core(ctx,'POST','/v1/channels/'+c.id+'/blueprints',{name:'Disposable '+ctx.runId,loadingInstruction:'Reply REGRESSION_OK without side effects',runtimeId:resource(ctx,'agent').runtimeId,invocationPolicy:'process'});await core(ctx,'PATCH','/v1/channels/'+second+'/blueprints/'+blueprint.id+'/selection',{enabled:true});await openTab(ctx,'Messages');await ctx.page.locator('[data-trace-nav="agents.manager"]').click();const dialog=ctx.page.getByRole('dialog');const row=dialog.getByRole('button',{name:blueprint.name,exact:true}).locator('..');await row.getByRole('checkbox').uncheck();await eventually(ctx,'First Channel participation is removed',()=>core(ctx,'GET','/v1/channels/'+c.id+'/blueprints'),rows=>rows.some(x=>x.id===blueprint.id&&!x.inChannel));ctx.assert('Second Channel retains participation',(await core(ctx,'GET','/v1/channels/'+second+'/blueprints')).some(x=>x.id===blueprint.id&&x.inChannel),true);await row.getByRole('button',{name:blueprint.name,exact:true}).click();await dialog.getByRole('button',{name:'Remove Agent',exact:true}).click();await eventually(ctx,'Owned blueprint is deleted',()=>core(ctx,'GET','/v1/channels/'+second+'/blueprints'),rows=>!rows.some(x=>x.id===blueprint.id));ctx.assert('Deleted blueprint cannot be selected',(await core(ctx,'PATCH','/v1/channels/'+c.id+'/blueprints/'+blueprint.id+'/selection',{enabled:true},{expectFailure:true})).ok,false);
}
