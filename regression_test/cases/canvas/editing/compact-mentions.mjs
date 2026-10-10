export const USECASE={name:'Read and edit compact Canvas mention references',description:'Insert a genuine GUI Agent mention, read its compact stable reference through Core, patch adjacent text and reload. Verify the original editor occurrence survives and remove the owned Canvas.'};
export const META={id:'canvas.editing.compact-mentions',module:'canvas/editing',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','read:channel.shared','write:canvas.collection'],affectedPaths:['local/canvas-codec/codec.mjs','desktop/ui/src/features/agent/AgentWorkDrawer.tsx']};
export const REQUIREMENTS={channel:{permission:'read'},agent:{connected:true},parameters:{keys:['disposable']}};
import {createDocument,deleteDocument} from '../../../support/canvas.mjs';
import {core,eventually,resource,cli,data} from '../../../support/client.mjs';
export async function run(ctx){const doc=await createDocument(ctx),agent=resource(ctx,'agent');try{
 const editor=ctx.page.locator('[contenteditable="true"]');await editor.fill('Before ');await editor.press('End');await editor.pressSequentially('@'+agent.name.split(' ')[0]);await ctx.page.getByRole('button').filter({has:ctx.page.getByText(agent.name,{exact:true})}).click();await editor.press('End');await editor.pressSequentially(' after');
 const capsule=editor.locator('[data-canvas-mention="true"][data-mention-id="'+agent.id+'"]');await capsule.waitFor();const label=await capsule.innerText();
 const before=await eventually(ctx,'GUI mention is durable and compact',()=>core(ctx,'GET','/v1/canvases/'+doc.id+'/document'),v=>v.content.includes('colab:agent:'+agent.id)&&v.content.includes('after'));
 const read=data(await cli(ctx,'colab-canvas',['read','--ref','colab://channel/'+resource(ctx,'channel').id+'/canvas/'+doc.id]));ctx.assert('Agent CLI sees compact stable reference',read.content.includes('colab:agent:'+agent.id),true);
 ctx.assert('Read does not expose encoded editor attributes',/colab-mention:|mentionId|eyJ/.test(before.content),false);
 await core(ctx,'POST','/v1/canvases/'+doc.id+'/apply-patch',{patch:'*** Begin Patch\n*** Update File: document.md\n@@\n-'+before.content.trim()+'\n+'+before.content.trim().replace(' after',' updated')+'\n*** End Patch'});
 await eventually(ctx,'Agent patch reaches GUI',()=>editor.innerText(),v=>v.includes('updated'));
 ctx.assert('Original mention target survives patch',await capsule.getAttribute('data-mention-id'),agent.id);ctx.assert('Original mention label survives patch',await capsule.innerText(),label);
 await ctx.page.reload();
 await ctx.page.locator('[data-item-id="'+doc.id+'"][data-item-kind="canvas"]').click();await capsule.waitFor();ctx.assert('Reload preserves stable target',await capsule.getAttribute('data-mention-id'),agent.id);await ctx.screenshot('Compact mention after Agent edit');
 }finally{await deleteDocument(ctx,doc);}}
