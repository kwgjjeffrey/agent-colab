import {isolated} from '../../../support/controls.mjs';
import {resource,core,cli,data,disposable,eventually} from '../../../support/client.mjs';
import {createDocument,deleteDocument} from '../../../support/canvas.mjs';
export const USECASE={name:'Renamed Canvas handoff uses current title and readable stable identity',description:'Create an owned Canvas, rename from the mixed sidebar without leaving its preview, open Give to Agent and execute the displayed read reference. Verify current title and actual document content, then rename again while the prompt is open and verify title reconciliation and retained reference. Archive the owned document.'};
export const META={id:'canvas.documents.rename-handoff',module:'canvas/documents',surface:'gui',priority:'critical',origin:'bug',status:'trial',effects:'isolated-write',cost:'normal',suite:'business',testLevel:'end-to-end',locks:['write:client.owner','write:browser.loopback-auth','write:canvas.collection'],affectedPaths:['desktop/ui/src/features/canvas/CanvasView.tsx','desktop/ui/src/features/workspace/CatalogWorkspace.tsx']};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','isolationConfirmed','isolatedCoreDiscoveryFile','isolatedClientBaseUrl','testUserId','testOrganizationId']}};
export async function run(ctx){
  disposable(ctx);
  const target=await isolated(ctx),channel=resource(ctx,'channel');
  await ctx.page.goto(target.baseUrl);
  const doc=await createDocument(ctx),name='算法规划 '+ctx.runId,marker='RENAME_HANDOFF_'+ctx.runId;
  try{
    const editor=ctx.page.locator('[contenteditable="true"]');
    await editor.fill(marker);
    await eventually(ctx,'Owned content is durable',()=>core(ctx,'GET',`/v1/canvases/${doc.id}/document`,undefined,target),row=>row.content.includes(marker));
    await ctx.page.locator(`[data-item-id="${doc.id}"][data-item-kind="canvas"]`).dblclick();
    const input=ctx.page.getByRole('textbox',{name:'Item name',exact:true});
    await input.fill(name);await input.press('Enter');
    await ctx.page.locator('nav[aria-label="breadcrumb"]').getByText(name,{exact:true}).waitFor();
    await ctx.page.getByRole('button',{name:'Give to Agent',exact:true}).click();
    const dialog=ctx.page.getByRole('dialog');
    await dialog.getByRole('heading',{name:`Give “${name}” to Agent`,exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Copy prompt',exact:true}).waitFor();
    const prompt=await dialog.locator('pre').innerText();
    ctx.assert('Prompt uses current name',prompt.includes(`Work on “${name}”.`),true);
    ctx.assert('Prompt no longer mentions original title',prompt.includes(doc.title),false);
    const ref=prompt.match(/read --ref '([^']+)'/)?.[1];
    ctx.assert('Read command uses exact stable document identity',ref,`colab://channel/${channel.id}/canvas/${doc.id}`);
    const read=data(await cli(ctx,'colab-canvas',['read','--ref',ref,'--offset','1','--limit','1000']));
    ctx.assert('Displayed read command returns actual renamed document',read.content.includes(marker),true);
    await ctx.screenshot('Renamed Canvas handoff and stable read');
    const next=name+' updated';
    await core(ctx,'PATCH',`/v1/canvases/${doc.id}`,{name:next},target);
    await ctx.page.evaluate(()=>window.dispatchEvent(new Event('colab:catalog-changed')));
    await dialog.getByRole('heading',{name:`Give “${next}” to Agent`,exact:true}).waitFor();
    ctx.assert('Open prompt reconciles latest title',(await dialog.locator('pre').innerText()).includes(`Work on “${next}”.`),true);
    const again=data(await cli(ctx,'colab-canvas',['read','--ref',ref]));
    ctx.assert('Already-issued reference survives another rename',again.content.includes(marker),true);
  }finally{await deleteDocument(ctx,doc);}
}
