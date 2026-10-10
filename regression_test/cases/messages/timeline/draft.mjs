export const USECASE={name:'Keep an unsent Message draft through navigation and reload',description:'An actual rich-text draft survives Home navigation and page reload; failed send keeps it and successful send removes it. Own synthetic draft and message only.'};
export const META={id:'communication.messages.draft',module:'messages/timeline',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/messages'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','read:channel.shared']};
export const REQUIREMENTS={channel:{permission:'read'}};
import {openTab} from '../../../support/gui.mjs';
import {resource} from '../../../support/client.mjs';
export async function run(ctx){
 const c=resource(ctx,'channel');const text='Draft regression '+ctx.runId;await openTab(ctx,'Messages');const editor=()=>ctx.page.getByLabel('Message '+c.name,{exact:true});
 ctx.assert('Fixture composer starts empty',await editor().innerText(),'');
 await editor().fill(text);await ctx.page.getByRole('button',{name:'Home',exact:true}).click();await ctx.page.getByRole('button',{name:'Message',exact:true}).click();
 ctx.assert('Navigation restores exact draft',await editor().innerText(),text);
 await ctx.page.reload();await editor().waitFor();ctx.assert('Reload restores exact draft',await editor().innerText(),text);
 const path='**/v1/channels/'+c.id+'/messages';await ctx.page.route(path,r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporary test failure"}'}):r.continue());
 await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();await ctx.page.getByRole('button',{name:'Send message',exact:true}).waitFor();ctx.assert('Failed send keeps draft',await editor().innerText(),text);await ctx.page.unroute(path);
 const response=ctx.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/channels/'+c.id+'/messages');await ctx.page.getByRole('button',{name:'Send message',exact:true}).click();ctx.assert('Real send succeeds',(await response).ok(),true);
 await ctx.page.waitForFunction(()=>document.querySelector('.agent-message-editor')?.textContent==='');await ctx.page.reload();await editor().waitFor();ctx.assert('Successful send clears persisted draft',await editor().innerText(),'');await ctx.screenshot('Sent Message clears local draft');
}
