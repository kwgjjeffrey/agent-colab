export const USECASE={name:'Messages and Sessions guides lead to real actions and retire naturally',description:'Create a run-owned empty Channel. Its Messages guide opens the Agent manager. Send case-owned conversation turns through the real composer and verify the guide scrolls above the viewport inside the same timeline. Verify all Session guides on the empty page. Register an owned synthetic Session through Local Core, reload, and verify all onboarding disappears while the actual Session remains visible. Withdraw the test Session in finally; retain the unique Channel and ordinary test message as evidence.'};
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
  "statusReason": "Updated for Sessions empty-only guidance and explicit selected Channel semantics; pending verification of the new behavior."
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','sessionSourcePath']}};
import {core,parameter,disposable,eventually} from '../../../support/client.mjs';
export async function run(ctx){
 disposable(ctx);const channel=await core(ctx,'POST','/v1/channels',{name:'Guide acceptance '+ctx.runId});let share;
 try{
 await ctx.page.reload();await ctx.page.getByRole('button',{name:channel.name,exact:true}).click();await ctx.page.getByRole('tab',{name:'Messages',exact:true}).click();
 const guide=ctx.page.getByRole('heading',{name:'Work together with your Agents',exact:true});await guide.waitFor();
 await ctx.page.getByRole('button',{name:'Add my Agent',exact:true}).click();await ctx.page.getByRole('dialog',{name:'Agents',exact:true}).waitFor();await ctx.page.keyboard.press('Escape');
 let pushedOut=false;
 for(let turn=0;turn<16&&!pushedOut;turn++){
 const body='ONBOARDING_MESSAGE_'+ctx.runId+' turn '+turn+' '+('Owned discussion context. '.repeat(24));
 await ctx.page.waitForFunction(()=>!document.querySelector('[contenteditable="true"]')?.textContent);
 const committed=ctx.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/channels/'+channel.id+'/messages');
 await ctx.page.locator('[contenteditable="true"]').fill(body);await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();const response=await committed;ctx.assert('Composer commits conversation turn '+turn,response.ok(),true);const message=await response.json();ctx.assert('Conversation turn preserves its input',message.body,body.trim());
 await ctx.page.locator('#message-'+message.id).waitFor();
 await ctx.page.waitForFunction(()=>!document.querySelector('[contenteditable="true"]')?.textContent);
 const a=await guide.locator('..').boundingBox();const b=await guide.locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")]').boundingBox();pushedOut=a.y+a.height<=b.y;
 }
 ctx.assert('Growing conversation pushes guide above the visible stream',pushedOut,true);
 await ctx.screenshot('Messages guide naturally scrolled out');
 await ctx.page.getByRole('tab',{name:'Sessions',exact:true}).click();for(const text of ['Share the work behind your answer','Let another Agent pick up the work','Review a decision or summarize progress'])ctx.assert('Empty Sessions explains '+text,await ctx.page.getByText(text,{exact:true}).isVisible(),true);
 share=await core(ctx,'POST','/v1/channels/'+channel.id+'/sessions/share',{sourcePath:parameter(ctx,'sessionSourcePath'),sourceAdapter:'codex-jsonl-v1',name:'Onboarding owned Session '+ctx.runId});
 await eventually(ctx,'Owned Session has a committed snapshot',()=>core(ctx,'GET','/v1/channels/'+channel.id+'/sessions'),rows=>rows.some(x=>x.id===share.id&&x.currentSnapshotId));
 await ctx.page.reload();await ctx.page.getByRole('tab',{name:'Sessions',exact:true}).waitFor();
 for(const text of ['Share the work behind your answer','Let another Agent pick up the work','Review a decision or summarize progress'])ctx.assert('Populated Sessions hides '+text,await ctx.page.getByText(text,{exact:true}).count(),0);
 await ctx.page.getByText(share.name,{exact:true}).waitFor();
 await ctx.screenshot('Populated Sessions has no onboarding');
 }finally{if(share){await core(ctx,'DELETE','/v1/sessions/'+share.id);await eventually(ctx,'Owned Session withdrawn',()=>core(ctx,'GET','/v1/channels/'+channel.id+'/sessions'),rows=>!rows.some(x=>x.id===share.id));}for(const doc of await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases'))await core(ctx,'DELETE','/v1/canvases/'+doc.id);ctx.assert('Owned welcome cleanup committed',(await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases')).length,0);}
}
