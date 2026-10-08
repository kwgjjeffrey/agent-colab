export const USECASE={name:'Messages and Sessions guides lead to real actions and retire naturally',description:'Create a run-owned empty Channel. Its Messages guide opens the Agent manager. Send case-owned conversation turns through the real composer and verify the guide scrolls above the viewport inside the same timeline. Verify all Session guides on the empty page. Register an owned synthetic Session through Local Core, use the real chooser and Copy prompt for review, and reload to check completion persists without hiding handoff guidance. Withdraw the test Session in finally; retain the unique Channel and ordinary test message as evidence.'};
export const META={id:'channels.onboarding.messages-sessions',module:'channels/onboarding',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/messages','desktop/ui/src/features/sessions'],suite:'business',testLevel:'end-to-end'};
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
 const committed=ctx.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/channels/'+channel.id+'/messages');
 await ctx.page.locator('[contenteditable="true"]').fill(body);await ctx.page.locator('[contenteditable="true"]').press('Enter');const response=await committed;ctx.assert('Composer commits conversation turn '+turn,response.ok(),true);const message=await response.json();
 await ctx.page.locator('#message-'+message.id).waitFor();
 const a=await guide.boundingBox();const b=await guide.locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")]').boundingBox();pushedOut=a.y+a.height<=b.y;
 }
 ctx.assert('Growing conversation pushes guide above the visible stream',pushedOut,true);
 await ctx.screenshot('Messages guide naturally scrolled out');
 await ctx.page.getByRole('tab',{name:'Sessions',exact:true}).click();for(const text of ['Share the work behind your answer','Let another Agent pick up the work','Review a decision or summarize progress'])ctx.assert('Empty Sessions explains '+text,await ctx.page.getByText(text,{exact:true}).isVisible(),true);
 share=await core(ctx,'POST','/v1/channels/'+channel.id+'/sessions/share',{sourcePath:parameter(ctx,'sessionSourcePath'),sourceAdapter:'codex-jsonl-v1',name:'Onboarding owned Session '+ctx.runId});
 await eventually(ctx,'Owned Session has a committed snapshot',()=>core(ctx,'GET','/v1/channels/'+channel.id+'/sessions'),rows=>rows.some(x=>x.id===share.id&&x.currentSnapshotId));
 await ctx.page.reload();await ctx.page.getByRole('tab',{name:'Sessions',exact:true}).waitFor();await ctx.page.getByText('Review a decision or summarize progress',{exact:true}).locator('xpath=ancestor::div[button]').getByRole('button',{name:'Try',exact:true}).click();
 await ctx.page.getByRole('dialog',{name:'Choose a shared session',exact:true}).getByRole('button').filter({hasText:share.name}).click();
 const prompt=ctx.page.getByRole('dialog').locator('pre');const text=await prompt.innerText();ctx.assert('Guide uses actual Session reader',text.includes('colab-session-reader')&&text.includes(encodeURIComponent(share.name)),true);ctx.assert('Review supplies the actual task',text.includes('Review the decisions in this session'),true);
 await ctx.page.getByRole('button',{name:'Copy prompt',exact:true}).click();await ctx.page.getByText('Review a decision or summarize progress',{exact:true}).waitFor({state:'hidden'});
 await ctx.page.reload();await ctx.page.getByRole('tab',{name:'Sessions',exact:true}).waitFor();ctx.assert('Delivered review guide remains hidden',await ctx.page.getByText('Review a decision or summarize progress',{exact:true}).count(),0);ctx.assert('Undone handoff guide remains',await ctx.page.getByText('Let another Agent pick up the work',{exact:true}).isVisible(),true);
 await ctx.screenshot('Session guide completion persisted');
 }finally{if(share)await core(ctx,'DELETE','/v1/sessions/'+share.id);for(const doc of await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases'))await core(ctx,'DELETE','/v1/canvases/'+doc.id);}
}
