export const USECASE={name:'Drag catalog items into folders, reorder, and return to root',description:'Create two disposable Catalogs through Local Core; use real pointer drag on GUI rows, verify persisted parent and sibling order through Core and after reload. Home remains navigation, Add opens item choices and Quick Share cascade. Remove only owned empty Catalogs in finally.'};
export const META={id:'context.catalog.drag',module:'context/catalog',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/workspace','server/standalone/crates/persistence/src/catalog.rs'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','write:channel.shared']};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
import {core,resource,disposable,eventually} from '../../support/client.mjs';
async function drag(page,source,target,position=0.5){
 const b=await target.boundingBox();if(!b)throw Error('Drop row not visible');
 await source.locator('..').locator('..').dragTo(target,{targetPosition:{x:b.width/2,y:b.height*position}});
}
export async function run(ctx){
 disposable(ctx);const channel=resource(ctx,'channel'),route=`/v1/channels/${channel.id}`;let a,b;
 try{
  a=await core(ctx,'POST',route+'/catalogs',{name:'Drag A '+ctx.runId});
  b=await core(ctx,'POST',route+'/catalogs',{name:'Drag B '+ctx.runId});
  await ctx.page.getByRole('button',{name:channel.name,exact:true}).click();
  await ctx.page.getByRole('button',{name:'Home',exact:true}).click();
  await ctx.page.getByRole('button',{name:'Add',exact:true}).click();
  await ctx.page.getByRole('menuitem',{name:'Catalog',exact:true}).waitFor();
  await ctx.page.getByRole('menuitem',{name:'Quick Share',exact:true}).hover();
  await ctx.page.getByRole('menuitem',{name:'Share a Session',exact:true}).waitFor();
  await ctx.page.getByRole('menuitem',{name:'Share a Session',exact:true}).click();
  await ctx.page.getByRole('dialog').getByRole('heading',{name:'Share a Session',exact:true}).waitFor();
  ctx.assert('Quick Share selector survives menu dismissal',await ctx.page.getByRole('dialog').count(),1);
  await ctx.page.keyboard.press('Escape');
  const row=id=>ctx.page.locator(`[data-item-id="${id}"]`);
  await row(a.id).waitFor();await row(b.id).waitFor();
  await drag(ctx.page,row(b.id),row(a.id));
  await eventually(ctx,'Dragging into Catalog persists parent',()=>core(ctx,'GET',route+'/catalog-items?parentId='+a.id),rows=>rows.some(item=>item.id===b.id));
  await row(b.id).waitFor();
  // Root whitespace is an explicit target; it never writes an invented item identity.
  const sidebar=ctx.page.locator('aside[aria-label="Channel items"]');
  const sb=await sidebar.boundingBox(),br=await row(b.id).boundingBox();
  await ctx.page.mouse.move(br.x+br.width/2,br.y+br.height/2);await ctx.page.mouse.down();await ctx.page.mouse.move(br.x+12,br.y+5,{steps:5});await ctx.page.mouse.move(sb.x+sb.width/2,sb.y+sb.height-20,{steps:20});await ctx.page.mouse.up();
  await eventually(ctx,'Dragging to root persists removal from Catalog',()=>core(ctx,'GET',route+'/catalog-items?limit=200'),rows=>rows.some(item=>item.id===b.id&&item.parentId===null));
  await drag(ctx.page,row(b.id),row(a.id),0.05);
  await eventually(ctx,'Before drop persists sibling order',()=>core(ctx,'GET',route+'/catalog-items?limit=200'),rows=>rows.findIndex(item=>item.id===b.id)<rows.findIndex(item=>item.id===a.id));
  await ctx.page.reload();await row(b.id).waitFor();
  const ids=await ctx.page.locator('[data-item-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-item-id')));
  ctx.assert('Reload retains the dragged order',ids.indexOf(b.id)<ids.indexOf(a.id),true);
  await ctx.screenshot('Home Add and persisted Catalog drag order');
 }finally{
  if(b){await core(ctx,'PATCH',route+'/catalog-items/position',{kind:'catalog',itemId:b.id,parentId:null});await core(ctx,'DELETE',route+'/catalogs/'+b.id);}
  if(a)await core(ctx,'DELETE',route+'/catalogs/'+a.id);
 }
}
