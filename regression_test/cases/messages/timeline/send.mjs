export const USECASE = {
  "name": "Send a message and observe it on another client",
  "description": "Purpose: Messages anchor user-to-agent and member collaboration.\n\nPreconditions: Two test clients are members of a disposable Channel.\n\nActions: Send a unique plain-text message and wait for both timelines.\n\nExpected results: The same committed message appears exactly once on both clients with the correct sender; errors do not appear as success."
};

export const META = {
  "id": "communication.messages.send",
  "module": "messages/timeline",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "trial",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {openTab} from "../../../support/gui.mjs";
export async function run(ctx){
const c=resource(ctx,'channel');const second=parameter(ctx,'secondClientBaseUrl');const other=await ctx.page.context().newPage();try{await other.goto(second);await other.getByRole('button',{name:c.name,exact:true}).click();await other.getByRole('tab',{name:'Messages',exact:true}).click();await openTab(ctx,'Messages');const text='Message regression '+ctx.runId;await ctx.page.getByLabel('Message '+c.name,{exact:true}).fill(text);await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();const rows=await eventually(ctx,'Message is committed',()=>core(ctx,'GET','/v1/channels/'+c.id+'/messages?after=0&limit=200'),rows=>rows.some(m=>m.body===text));const committed=rows.find(m=>m.body===text);await ctx.page.getByText(text,{exact:true}).waitFor();await other.getByText(text,{exact:true}).waitFor();ctx.assert('Sender is a real member',committed.senderKind,'human');ctx.assert('One message is visible on sender',await ctx.page.getByText(text,{exact:true}).count(),1);ctx.assert('One message is visible on receiver',await other.getByText(text,{exact:true}).count(),1);}finally{await other.close();}
}
export const REQUIREMENTS={"parameters": {"keys": ["secondClientBaseUrl"]}, "channel": {"permission": "read"}};
