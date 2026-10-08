export const USECASE={name:'Every new Channel starts with an editable, deletable Canvas guide',description:'Create one run-owned Channel through the real GUI. Read its default welcome document through Local Core, edit through the real editor, then delete through the tree. Reload and verify deletion persists. The unique Channel is retained as regression evidence; no existing user document is modified.'};
export const META={id:'channels.onboarding.welcome-canvas',module:'channels/onboarding',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/canvas','server/standalone/crates/persistence'],suite:'business',testLevel:'end-to-end'};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
import {core,disposable,eventually} from '../../../support/client.mjs';
export async function run(ctx){
 disposable(ctx);const name='Welcome acceptance '+ctx.runId;
 await ctx.page.getByRole('button',{name:'Create channel',exact:true}).click();
 await ctx.page.getByLabel('Channel name',{exact:true}).fill(name);
 const response=ctx.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/channels');
 await ctx.page.getByRole('dialog').getByRole('button',{name:'Create',exact:true}).click();
 const reply=await response;ctx.assert('GUI commits Channel',reply.ok(),true);const channel=await reply.json();
 const docs=await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases');ctx.assert('Exactly one default Canvas',docs.length,1);const doc=docs[0];
 ctx.assert('Default Canvas is named',doc.title,'Welcome to Canvas');
 const projection=await core(ctx,'GET','/v1/canvases/'+doc.id+'/document');
 for(const text of ['Write together','Turn a plan into work','Project brief:','Investigation notes:','Decision record:','Team handoff:'])ctx.assert('Guide contains '+text,projection.content.includes(text),true);
 try{
 await ctx.page.getByRole('tab',{name:'Canvas',exact:true}).click();
 const editor=ctx.page.locator('[contenteditable="true"]');await editor.waitFor();
 await editor.fill('Owned welcome edit '+ctx.runId);
 await eventually(ctx,'Editor changes are durable',()=>core(ctx,'GET','/v1/canvases/'+doc.id+'/document'),x=>x.content.includes('Owned welcome edit '+ctx.runId));
 await ctx.screenshot('Welcome Canvas edited in real GUI');
 await ctx.page.getByRole('button',{name:'Delete Welcome to Canvas',exact:true}).click();
 await ctx.page.getByRole('alertdialog').getByRole('button',{name:'Delete',exact:true}).click();
 await eventually(ctx,'Deleted welcome absent',()=>core(ctx,'GET','/v1/channels/'+channel.id+'/canvases'),x=>x.length===0);
 await ctx.page.reload();await ctx.page.getByRole('tab',{name:'Canvas',exact:true}).waitFor();
 ctx.assert('Reload keeps Canvas tab',await ctx.page.getByRole('tab',{name:'Canvas',exact:true}).getAttribute('aria-selected'),'true');
 ctx.assert('Deleted welcome never reappears',(await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases')).length,0);
 }finally{const remaining=await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases');for(const row of remaining)await core(ctx,'DELETE','/v1/canvases/'+row.id);}
}
