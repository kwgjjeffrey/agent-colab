export const USECASE = {
  "name": "Share a complete agent Session",
  "description": "Purpose: The reasoning history is a first-class collaboration resource.\n\nPreconditions: A fixture Session exists in a supported provider format.\n\nActions: Discover the source, share it to a disposable Channel and list it as another member.\n\nExpected results: The source Session becomes a Shared Item with correct contributor and provider metadata; GUI does not replace it with a summary."
};

export const META = {
  "id": "context.sessions.sharing.register",
  "module": "context/sessions/sharing",
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
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {openTab} from "../../../../support/gui.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["indexedSessionSourceId", "secondCoreDiscoveryFile"]}};
export async function run(ctx){
const c=resource(ctx,'channel'),sourceId=parameter(ctx,'indexedSessionSourceId'),second=parameter(ctx,'secondCoreDiscoveryFile');const sources=await core(ctx,'GET','/v1/session-sources?q='+encodeURIComponent(sourceId)+'&limit=200');const source=sources.find(s=>s.id===sourceId||s.threadId===sourceId);ctx.assert('Configured source is actually indexed',!!source,true);await openTab(ctx,'Sessions');await ctx.page.getByRole('button',{name:'Share a session',exact:true}).click();const d=ctx.page.getByRole('dialog',{name:'Share a Session',exact:true});await d.getByLabel('Search sessions',{exact:true}).fill(source.threadId);await d.getByRole('button').filter({hasText:source.threadId}).click();const rows=await eventually(ctx,'Session appears as a full shared item',()=>core(ctx,'GET','/v1/channels/'+c.id+'/sessions'),rows=>rows.some(x=>x.name===source.name));const share=rows.find(x=>x.name===source.name);try{const received=await core(ctx,'GET','/v1/channels/'+c.id+'/sessions',undefined,{discoveryFile:second});ctx.assert('Second member sees identical Session identity',received.some(x=>x.id===share.id&&x.sourceAdapter===share.sourceAdapter),true);const read=await core(ctx,'POST','/v1/sessions/'+share.id+'/read',{turnLimit:20},{discoveryFile:second});ctx.assert('Shared Session is readable as turns',read.turns.length>0,true);}finally{await core(ctx,'DELETE','/v1/sessions/'+share.id);}
}
