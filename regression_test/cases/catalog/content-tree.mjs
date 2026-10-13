import {core,resource} from '../../support/client.mjs';
export const USECASE={name:'Catalog content tree navigation',description:'Expand and collapse the actual content tree, then navigate to an owned Canvas. Reuse Server Catalog placement and remove owned fixtures.'};
export const META={id:'catalog.content-tree',module:'catalog',surface:'gui',priority:'critical',origin:'requirement',status:'active',effects:'isolated-write',cost:'normal',requires:['local-core'],locks:['write:channel.shared'],affectedPaths:['desktop/ui/src/features/workspace/CatalogWorkspace.tsx']};
export const REQUIREMENTS={channel:{permission:'read'}};
export async function run(ctx){
 const channel=resource(ctx,'channel');let root,nested,canvas;
 try{
  root=await core(ctx,'POST',`/v1/channels/${channel.id}/catalogs`,{name:'Tree '+ctx.runId});
  nested=await core(ctx,'POST',`/v1/channels/${channel.id}/catalogs`,{name:'Nested '+ctx.runId,parentId:root.id});
  canvas=await core(ctx,'POST',`/v1/channels/${channel.id}/canvases`,{title:'Tree document '+ctx.runId,folderId:nested.id});
  await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:channel.name,exact:true}).click();
  await ctx.page.reload();await ctx.page.locator(`[data-item-id="${root.id}"]`).click();
  const list=ctx.page.getByLabel('Catalog contents');
  await list.getByRole('button',{name:'Expand '+nested.name,exact:true}).click();
  await list.locator(`[data-list-item-id="${canvas.id}"]`).waitFor();
  await list.getByRole('button',{name:'Collapse '+nested.name,exact:true}).click();
  ctx.assert('Collapse hides child document',await list.locator(`[data-list-item-id="${canvas.id}"]`).isVisible(),false);
  await list.getByRole('button',{name:'Expand '+nested.name,exact:true}).click();
  await ctx.screenshot('Expanded Catalog content tree');
  await list.locator(`[data-list-item-id="${canvas.id}"]`).click();
  await ctx.page.locator('[contenteditable="true"]').waitFor();
  ctx.assert('Leaf opens actual Canvas editor',true,true);
 }finally{
  if(canvas)await core(ctx,'DELETE',`/v1/canvases/${canvas.id}`);
  if(nested)await core(ctx,'DELETE',`/v1/channels/${channel.id}/catalogs/${nested.id}`);
  if(root)await core(ctx,'DELETE',`/v1/channels/${channel.id}/catalogs/${root.id}`);
 }
}
