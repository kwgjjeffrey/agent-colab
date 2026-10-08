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
  "testLevel": "end-to-end",
  "statusReason": "Round 12 20261007T122018Z-9daf491a: actual GUI POST identity, exact committed message ID, exactly one rendered copy on both independent client contexts verified after cold-list merge race repair.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:client.receiver"
  ]
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {openTab} from "../../../support/gui.mjs";
export async function run(ctx){
const c=resource(ctx,'channel');const second=parameter(ctx,'secondClientBaseUrl');const other=await secondary(ctx);try{await other.locator('[aria-label="Channels"]').getByRole('button',{name:c.name,exact:true}).click();await other.getByRole('button',{name:'Message',exact:true}).click();await openTab(ctx,'Messages');const text='Message regression '+ctx.runId;await ctx.page.getByLabel('Message '+c.name,{exact:true}).fill(text);const actor=await core(ctx,'GET','/v1/auth/status');const response=ctx.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/channels/'+c.id+'/messages');await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();const reply=await response;ctx.assert('GUI message commits successfully',reply.ok(),true);const committed=await reply.json();ctx.assert('Committed message contains the exact input',committed.body,text);await ctx.page.locator('[id="message-'+committed.id+'"]').waitFor();await other.locator('[id="message-'+committed.id+'"]').waitFor();ctx.assert('Sender is a real member',committed.senderKind,'member');ctx.assert('Sender is the signed-in test identity',committed.senderName,actor.user.displayName);ctx.assert('One message is visible on sender',await ctx.page.locator('[id="message-'+committed.id+'"]').count(),1);ctx.assert('One message is visible on receiver',await other.locator('[id="message-'+committed.id+'"]').count(),1);}finally{await other.close();}
}
export const REQUIREMENTS={"parameters": {"keys": ["secondClientBaseUrl"]}, "channel": {"permission": "read"}};

import {secondary} from '../../../support/controls.mjs';
