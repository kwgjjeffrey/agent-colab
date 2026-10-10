export const USECASE={name:'Create shared items directly from an editor mention',description:'Message and Canvas open Sessions, Files and Skills from the hover menu; real registration inserts a stable capsule without leaving the editor. Cancel leaves the draft untouched.'};
export const META={id:'context.references.add-mention',module:'context/references',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'slow',requires:['local-core'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','read:channel.shared','write:canvas.collection','write:messages.composer','write:context.shares'],affectedPaths:['desktop/ui/src/features/context/create-mention.ts','desktop/ui/src/features/context/AddMentionItem.tsx','desktop/ui/src/main.tsx']};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','nativeChooserBoundary']}};
import {createDocument,deleteDocument} from '../../../support/canvas.mjs';
import {core,eventually,resource,disposable} from '../../../support/client.mjs';
import {openTab} from '../../../support/gui.mjs';
import {fixtures} from '../../../support/fixtures.mjs';
import {withPathSelection} from '../../../support/selection.mjs';

export async function run(ctx){
 disposable(ctx); const owned=[],channel=resource(ctx,'channel');let doc;
 try{
  for(const surface of ['Message','Canvas']){
   if(surface==='Canvas')doc=await createDocument(ctx);else await openTab(ctx,'Messages');
   const editor=ctx.page.locator('[contenteditable="true"]').last();
   for(const [kind,label,title] of [['session','Sessions','Share a Session'],['files','Files','Share files'],['skill','Skills','Share a Skill']]){
    const fixture=await fixtures({...ctx,caseId:ctx.caseId+'-'+surface+'-'+kind});
    // Supply only source discovery and native picker boundaries. Registration and storage remain real.
    if(kind==='session')await ctx.page.route('**/v1/session-sources?*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'owned',threadId:'owned',name:'Owned '+surface+' Session '+ctx.runId,codingAgent:'codex',sourceAdapter:'codex-jsonl-v1',sourcePath:fixture.session,updatedAt:new Date().toISOString()}])}));
    await editor.fill('Before ');await editor.press('End');await editor.pressSequentially('@');
    await ctx.page.getByRole('button',{name:'Add new item',exact:true}).hover();
    await ctx.page.getByRole('menuitem',{name:label,exact:true}).click();
    const dialog=ctx.page.getByRole('dialog').filter({has:ctx.page.getByRole('heading',{name:title,exact:true})});await dialog.waitFor();
    const response=ctx.page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/'+(kind==='session'?'sessions':kind==='skill'?'skills':'files')+'/share'));
    if(kind==='session')await dialog.getByRole('button').filter({hasText:'Owned '+surface+' Session'}).click();
    else await withPathSelection(ctx,kind==='files'?fixture.files:fixture.skill,async()=>{
     await dialog.getByRole('button',{name:kind==='files'?'Choose files':'Choose Skill folder',exact:true}).click();
     if(kind==='files')await ctx.page.getByRole('dialog').filter({has:ctx.page.getByRole('heading',{name:'Review synchronization scope',exact:true})}).getByRole('button',{name:'Share',exact:true}).click();
    });
    const received=await response;const result=await received.json();ctx.assert(surface+' '+kind+' registration succeeds: '+JSON.stringify(result),received.ok(),true);ctx.assert('Registration returns a stable UUID',typeof result.id==='string',true);owned.push({kind,id:result.id});await dialog.waitFor({state:'hidden'});
    await eventually(ctx,surface+' '+kind+' capsule appears in original editor',()=>editor.innerText(),v=>v.includes('Before')&&!v.includes('@'));
    if(surface==='Canvas')await eventually(ctx,kind+' uses durable stable identity',()=>core(ctx,'GET','/v1/canvases/'+doc.id+'/document'),v=>v.content.includes('colab:'+kind+':'+result.id));
    ctx.assert(surface+' remains selected after '+kind,await editor.isVisible(),true);
    if(kind==='session')await ctx.page.unroute('**/v1/session-sources?*');
   }
   await editor.fill('Cancel ');await editor.press('End');await editor.pressSequentially('@');await ctx.page.getByRole('button',{name:'Add new item',exact:true}).hover();await ctx.page.getByRole('menuitem',{name:'Files',exact:true}).click();await ctx.page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();ctx.assert(surface+' cancellation preserves draft',await editor.innerText(),'Cancel @');await editor.fill('');await ctx.screenshot(surface+' Add new item acceptance');
  }
 }finally{if(doc)await deleteDocument(ctx,doc);for(const row of owned.reverse())await core(ctx,'DELETE','/v1/'+(row.kind==='session'?'sessions':row.kind==='skill'?'skills':'files')+'/'+row.id);await ctx.page.unroute('**/v1/session-sources?*');}
}
