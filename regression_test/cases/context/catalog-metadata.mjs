export const USECASE={name:'Show direct Catalog counts and shared-item contributor profiles',description:'Cancel Session, Files, Skill and Catalog creation from each existing shared asset preview and verify selection and breadcrumb survive. Verify whole-row hover and selection and no reserved action gutter. Create an owned Catalog containing a nested Catalog and one Canvas, plus a Canvas inside the nested Catalog. Verify the collapsed count is two, never three descendants. For real Files, Session and Skill fixtures inspect contributor metadata, click the sidebar avatar, and verify the existing member profile appears without navigating away. Remove only owned test documents and empty catalogs.'};
export const META={
  "id": "context.catalog.metadata",
  "module": "context/catalog",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "locks": [
    "read:client.primary",
    "write:channel.shared"
  ],
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/workspace",
    "server/standalone/crates/persistence/src/catalog.rs"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed GUI 0.1.142-dev Round 20261009T054907Z-5e582801: 61 assertions passed, including 12 creation cancellations preserving the active shared asset, full-row hover/selection, aligned metadata without hidden-action gutter, real uploader profiles and owned fixture cleanup."
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','filesName','sessionName','skillName']}};
import {core,resource,parameter,disposable,eventually} from '../../support/client.mjs';
export async function run(ctx){disposable(ctx);const c=resource(ctx,'channel'),base='/v1/channels/'+c.id;let folder,nested;const docs=[];try{
 folder=await core(ctx,'POST',base+'/catalogs',{name:'Count '+ctx.runId});nested=await core(ctx,'POST',base+'/catalogs',{name:'Nested '+ctx.runId,parentId:folder.id});
 for(const id of [folder.id,nested.id])docs.push(await core(ctx,'POST',base+'/canvases',{title:'Count fixture',folderId:id}));
 const rows=await core(ctx,'GET',base+'/catalog-items?limit=200');ctx.assert('Catalog counts direct children only',rows.find(x=>x.id===folder.id)?.childCount,2);
 await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:c.name,exact:true}).click();await ctx.page.reload();await ctx.page.locator('[aria-label="Channel items"]').waitFor();
 ctx.assert('Collapsed Catalog shows its count',await ctx.page.getByLabel('2 items in '+folder.name,{exact:true}).innerText(),'2');
 for(const [kind,key] of [['files','filesName'],['session','sessionName'],['skill','skillName']]){
  const row=rows.find(x=>x.kind===kind&&x.name===parameter(ctx,key));ctx.assert(kind+' carries uploader identity',Boolean(row?.contributorMemberId&&row?.contributorName),true);
  const button=ctx.page.locator('[data-item-id="'+row.id+'"][data-item-kind="'+kind+'"]');await button.click();const crumb=ctx.page.locator('nav[aria-label="breadcrumb"]');await crumb.getByText(row.name,{exact:true}).waitFor();
  for(const [label,title] of [['Session','Share a Session'],['Files','Share files'],['Skill','Share a Skill'],['Catalog','Create catalog']]){await ctx.page.getByRole('button',{name:'Add',exact:true}).click();await ctx.page.getByRole('menuitem',{name:label,exact:true}).click();const dialog=ctx.page.getByRole('dialog');await dialog.getByRole('heading',{name:title,exact:true}).waitFor();ctx.assert(kind+' preview remains selected while adding '+label,await button.locator('..').getAttribute('data-selected'),'true');if(label==='Files')await ctx.page.keyboard.press('Escape');else await dialog.getByRole('button',{name:'Close',exact:true}).click();await ctx.page.waitForFunction(()=>!document.querySelector('[data-slot="dialog-content"]'));ctx.assert(kind+' preview survives cancelled '+label,await crumb.getByText(row.name,{exact:true}).isVisible(),true);}
  const layout=await button.locator('..').evaluate(node=>{const meta=node.querySelector('[data-catalog-metadata]');return {gap:node.getBoundingClientRect().right-meta.getBoundingClientRect().right,right:meta.getBoundingClientRect().right,selected:node.dataset.selected,background:getComputedStyle(node).backgroundColor};});ctx.assert(kind+' metadata has no unused action gutter',layout.gap<=6,true);ctx.assert(kind+' selects the complete row',layout.selected,'true');ctx.assert(kind+' row has selected background',layout.background!=='rgba(0, 0, 0, 0)',true);const countRight=await ctx.page.getByLabel('2 items in '+folder.name,{exact:true}).locator('..').evaluate(node=>node.getBoundingClientRect().right);ctx.assert(kind+' metadata aligns with Catalog count',Math.abs(layout.right-countRight)<1,true);
  const avatar=button.locator('..').getByRole('button',{name:'Uploaded by '+row.contributorName,exact:true});ctx.assert(kind+' has clickable uploader avatar',await avatar.isVisible(),true);await avatar.click();
  const profile=ctx.page.locator('[data-slot="popover-content"][data-open]').getByText('Agents in this Channel',{exact:true});await profile.waitFor();ctx.assert(kind+' opens the member profile',await profile.isVisible(),true);ctx.assert(kind+' avatar does not navigate away',await crumb.getByText(row.name,{exact:true}).isVisible(),true);await ctx.page.waitForFunction(()=>{const node=document.querySelector('[data-slot="popover-content"][data-open]');return node&&Number(getComputedStyle(node).opacity)===1;});await ctx.screenshot(kind+' uploader profile');await ctx.page.keyboard.press('Escape');
 }
 await ctx.page.waitForFunction(()=>!document.querySelector('[data-slot="popover-content"]'));const count=ctx.page.getByLabel('2 items in '+folder.name,{exact:true});await count.hover();await ctx.page.waitForTimeout(200);const hover=await count.locator('../..').evaluate(node=>({row:getComputedStyle(node).backgroundColor,button:getComputedStyle(node.querySelector('[data-item-id]')).backgroundColor}));ctx.assert('Hover colors the complete Catalog row',hover.row!=='rgba(0, 0, 0, 0)',true);ctx.assert('Name action does not own a separate hover surface',hover.button,'rgba(0, 0, 0, 0)');await ctx.screenshot('Catalog counts and contributor avatars');
 }finally{for(const doc of docs)await core(ctx,'DELETE','/v1/canvases/'+doc.id);if(nested)await core(ctx,'DELETE',base+'/catalogs/'+nested.id);if(folder)await core(ctx,'DELETE',base+'/catalogs/'+folder.id);}}
