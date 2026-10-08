export const USECASE = {
  "name": "Reply with a stable context reference",
  "description": "Purpose: Visible conversation context must survive storage and reload.\n\nPreconditions: A disposable Channel contains a message and shared context.\n\nActions: Reply to the message with a context capsule, then reopen the conversation.\n\nExpected results: The reply retains the original message relationship and correct resource identity; display labels do not change authorization."
};

export const META = {
  "id": "communication.messages.reply-context",
  "module": "messages/timeline",
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
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source b1a4accc27bc: Actual GUI quote retains trigger and resource identity; exact committed reply survives reload.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:browser.navigation"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {openTab} from "../../../support/gui.mjs";
import {seed} from "../../../support/controls.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["messageContext"]}};
export async function run(ctx){
const c=resource(ctx,'channel'),context=parameter(ctx,'messageContext'),original=await seed(ctx,'ORIGINAL_'+ctx.runId);await openTab(ctx,'Messages');const row=ctx.page.locator('#message-'+original.id);await row.getByRole('button',{name:/^Quote /}).click();const editor=ctx.page.getByLabel('Message '+c.name,{exact:true});await editor.fill('');await editor.pressSequentially('@'+context.label.split(' ')[0]);await ctx.page.locator('form').getByRole('button').filter({hasText:context.label}).click();await editor.press('End');await editor.pressSequentially(' REPLY_'+ctx.runId);await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();const rows=await eventually(ctx,'Context reply is committed',()=>core(ctx,'GET','/v1/channels/'+c.id+'/messages?after='+original.seq+'&limit=100'),rows=>rows.some(m=>m.body.includes('REPLY_'+ctx.runId)));const reply=rows.find(m=>m.body.includes('REPLY_'+ctx.runId));ctx.assert('Reply retains its original trigger',reply.replyToMessageId,original.id);ctx.assert('Resource identity is preserved',JSON.stringify(reply.content).includes(context.id),true);await ctx.page.reload();await openTab(ctx,'Messages');await ctx.page.locator('#message-'+reply.id).waitFor();ctx.assert('Committed reply survives reload',await ctx.page.locator('#message-'+reply.id).count(),1);
}
