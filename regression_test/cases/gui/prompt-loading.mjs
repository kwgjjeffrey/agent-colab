export const USECASE={name:'Give to Agent opens before prompt preparation finishes',description:'Delay the real Canvas/Files preparation request without fabricating a response. Verify immediate dialog/loading, disabled handoff, retained user query, real prompt completion, and closing during preparation never reopens it. No clipboard, Agent launch or business mutation.'};
export const META={id:'gui.prompt.loading',module:'gui/handoff',surface:'gui',priority:'critical',origin:'bug',status:'trial',effects:'read-only',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/agent/AgentPromptDialog.tsx','desktop/ui/src/features/canvas/CanvasView.tsx','desktop/ui/src/features/files/FilesView.tsx'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','read:channel.shared']};
export const REQUIREMENTS={channel:{permission:'read'}};
import {core,resource} from '../../support/client.mjs';
import {openTab} from '../../support/gui.mjs';
export async function run(ctx){
  const channel=resource(ctx,'channel'),items=await core(ctx,'GET',`/v1/channels/${channel.id}/catalog-items?limit=200`);
  for(const kind of ['canvas','files']){
    await openTab(ctx,'Home');const item=items.find(row=>row.kind===kind);if(!item)ctx.block('Missing '+kind+' read fixture');
    await ctx.page.locator(`[data-item-id="${item.id}"]`).click();
    await ctx.page.locator('nav[aria-label="breadcrumb"]').getByText(item.name,{exact:true}).waitFor();
    if(kind==='canvas')await ctx.page.locator('[contenteditable="true"]').waitFor();
    const pattern=kind==='canvas'?`**/v1/canvases/${item.id}/document`:'**/v1/channels';
    let release;let gate=new Promise(resolve=>release=resolve),pending;
    const handler=async route=>{await gate;await route.continue();};
    await ctx.page.route(pattern,handler);
    try{
      pending=ctx.page.waitForRequest(request=>kind==='canvas'?request.url().endsWith(`/v1/canvases/${item.id}/document`):request.url().endsWith('/v1/channels'));
      await ctx.page.getByRole('button',{name:'Give to Agent',exact:true}).click();await pending;
      const dialog=ctx.page.getByRole('dialog');await dialog.getByText('Preparing Agent prompt…',{exact:true}).waitFor();
      ctx.assert(kind+' dialog appears while real preparation is blocked',await dialog.isVisible(),true);
      ctx.assert(kind+' cannot copy an unfinished prompt',await dialog.getByRole('button',{name:'Copy prompt',exact:true}).isEnabled(),false);
      await dialog.getByLabel('User query').fill('Keep this task instruction');
      await ctx.screenshot(kind+' handoff immediately shows loading');release();
      await dialog.locator('pre').waitFor();ctx.assert(kind+' real prompt assembled',(await dialog.locator('pre').innerText()).includes('colab-'),true);
      ctx.assert(kind+' query survives preparation',await dialog.getByLabel('User query').inputValue(),'Keep this task instruction');
      await ctx.page.keyboard.press('Escape');
      gate=new Promise(resolve=>release=resolve);
      pending=ctx.page.waitForRequest(request=>kind==='canvas'?request.url().endsWith(`/v1/canvases/${item.id}/document`):request.url().endsWith('/v1/channels'));
      await ctx.page.getByRole('button',{name:'Give to Agent',exact:true}).click();await pending;
      await dialog.getByText('Preparing Agent prompt…',{exact:true}).waitFor();await ctx.page.keyboard.press('Escape');release();
      await ctx.page.waitForTimeout(2000);ctx.assert(kind+' late response does not reopen a closed dialog',await dialog.count(),0);
    }finally{release();await ctx.page.unroute(pattern,handler);}
  }
}
