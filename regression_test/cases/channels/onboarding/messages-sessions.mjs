export const USECASE={name:'Messages and Sessions guides lead to real actions and retire naturally',description:'Create a run-owned empty Channel. Its Messages guide opens the Agent manager. Send case-owned conversation turns through the real composer and verify the guide scrolls above the viewport inside the same timeline. Verify Home use cases and Add > Session discovery. Register an owned synthetic Session through Local Core, reload, and open its real bounded conversation preview in the mixed tree. Withdraw the test Session in finally; retain the unique Channel and ordinary test message as evidence.'};
export const META={
  "id": "channels.onboarding.messages-sessions",
  "module": "channels/onboarding",
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
    "desktop/ui/src/features/sessions"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed Round 20261008T025951Z-a7143d75: empty guides, actual conversation scrolling, populated Session guide absence and owned share/Canvas cleanup passed; 32 assertions and screenshots reviewed.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:session.fixture"
  ]
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','sessionSourcePath']}};
import {core,parameter,disposable,eventually} from '../../../support/client.mjs';
export async function run(ctx){
 disposable(ctx);const channel=await core(ctx,'POST','/v1/channels',{name:'Guide acceptance '+ctx.runId});let share;
 try{
 await ctx.page.reload();await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:channel.name,exact:true}).click();await ctx.page.getByRole('button',{name:'Message',exact:true}).click();
 const guide=ctx.page.getByRole('heading',{name:'Work together with your Agents',exact:true});await guide.waitFor();
 const avatar=ctx.page.getByRole('img',{name:'Agent Colab',exact:true});ctx.assert('Welcome message has the official Colab avatar',await avatar.isVisible(),true);await ctx.screenshot('Messages welcome avatar');
 await ctx.page.getByRole('button',{name:'Add my Agent',exact:true}).click();await ctx.page.getByRole('dialog',{name:'Agents',exact:true}).waitFor();await ctx.page.keyboard.press('Escape');
 let pushedOut=false;
 for(let turn=0;turn<16&&!pushedOut;turn++){
 const body='ONBOARDING_MESSAGE_'+ctx.runId+' turn '+turn+' '+('Owned discussion context. '.repeat(24));
 await ctx.page.waitForFunction(()=>!document.querySelector('[contenteditable="true"]')?.textContent);
 const committed=ctx.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/channels/'+channel.id+'/messages');
 await ctx.page.locator('[contenteditable="true"]').fill(body);await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();const response=await committed;ctx.assert('Composer commits conversation turn '+turn,response.ok(),true);const message=await response.json();ctx.assert('Conversation turn preserves its input',message.body,body.trim());
 await ctx.page.locator('#message-'+message.id).waitFor();
 await ctx.page.waitForFunction(()=>!document.querySelector('[contenteditable="true"]')?.textContent);
 const a=await guide.locator('../..').boundingBox();const b=await guide.locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")]').boundingBox();pushedOut=a.y+a.height<=b.y;
 }
 ctx.assert('Growing conversation pushes guide above the visible stream',pushedOut,true);
 await ctx.screenshot('Messages guide naturally scrolled out');
 await ctx.page.getByRole('button',{name:'Home',exact:true}).click();await ctx.page.getByRole('button',{name:'View all use cases',exact:true}).waitFor();
 await ctx.page.getByRole('button',{name:'Add',exact:true}).click();await ctx.page.getByRole('menuitem',{name:'Session',exact:true}).click();await ctx.page.getByRole('dialog').waitFor();ctx.assert('Session discovery opens from the mixed workspace',await ctx.page.getByRole('dialog').count(),1);await ctx.page.keyboard.press('Escape');
 share=await core(ctx,'POST','/v1/channels/'+channel.id+'/sessions/share',{sourcePath:parameter(ctx,'sessionSourcePath'),sourceAdapter:'codex-jsonl-v1',name:'Onboarding owned Session '+ctx.runId});
 await eventually(ctx,'Owned Session has a committed snapshot',()=>core(ctx,'GET','/v1/channels/'+channel.id+'/sessions'),rows=>rows.some(x=>x.id===share.id&&x.currentSnapshotId));
 await ctx.page.reload();const sharedItem=ctx.page.locator(`[data-item-id="${share.id}"][data-item-kind="session"]`);await sharedItem.waitFor();await sharedItem.click();await ctx.page.locator('[data-session-message]').first().waitFor();ctx.assert('Populated mixed directory opens actual conversation',await ctx.page.locator('[data-trace-region="session-preview"] [role=alert]').count(),0);await ctx.screenshot('Shared Session opens from the mixed directory');
 }finally{if(share){await core(ctx,'DELETE','/v1/sessions/'+share.id);await eventually(ctx,'Owned Session withdrawn',()=>core(ctx,'GET','/v1/channels/'+channel.id+'/sessions'),rows=>!rows.some(x=>x.id===share.id));}for(const doc of await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases'))await core(ctx,'DELETE','/v1/canvases/'+doc.id);ctx.assert('Owned welcome cleanup committed',(await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases')).length,0);}
}
