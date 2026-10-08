export const USECASE={name:'Organize and consume mixed Catalog assets through Explorer and GUI',description:'In an explicitly disposable Channel, create a nested Catalog through the installed domain interfaces, share a known Session source into it, read via the stable consumer reference, reject a cycle and non-empty deletion, then move the Session to root and prove the same stable reference still reads. GUI must keep Channel header, Add/Message entries and tree, open the exact Catalog, rename through its real Dialog and persist after reload. Finally withdraw only this case-owned Session and remove its empty Catalogs.'};
export const META={id:'context.catalog.workspace',module:'context/catalog',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/workspace','local/crates/local-api/src/catalog.rs','server/standalone/crates/persistence/src/catalog.rs','skills/colab/lib/explorer.py'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','write:channel.shared']};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','indexedSessionSourceId']}};
import {core,cli,resource,parameter,disposable,channelRef,eventually} from '../../support/client.mjs';
export async function run(ctx){
 disposable(ctx);const channel=resource(ctx,'channel'),rootRef=channelRef(ctx),name='Catalog '+ctx.runId;
 let root,child,shared;
 try{
  const created=await cli(ctx,'colab-explorer',['create-catalog','--parent',rootRef,'--name',name]);
  const listing=await cli(ctx,'colab-explorer',['open','--ref',rootRef]);root=listing.data.items.find(item=>item.name===name);ctx.assert('New Catalog appears in mixed root listing',root?.kind,'catalog');
  const nested=await cli(ctx,'colab-explorer',['create-catalog','--parent',created.data.ref,'--name','Implementation']);
  const branch=await cli(ctx,'colab-explorer',['open','--ref',root.explorerRef]);child=branch.data.items.find(item=>item.name==='Implementation');
  ctx.assert('Catalog opens direct children through stable identity',child?.kind,'catalog');
  const receipt=await cli(ctx,'colab-explorer',['share','--parent',nested.data.ref,'--item-type','session','--source',parameter(ctx,'indexedSessionSourceId'),'--name',name+' Session']);shared=receipt.data;
  const content=await cli(ctx,'colab-session-reader',['read','--ref',shared.stableRef,'--turn-limit','5']);ctx.assert('Shared Session is consumable through its stable reference',Array.isArray(content.data.turns),true);
  await cli(ctx,'colab-explorer',['move','--ref',root.explorerRef,'--parent',child.explorerRef],{expectedCode:2});
  await cli(ctx,'colab-explorer',['remove-catalog','--ref',child.explorerRef],{expectedCode:2});
  const before=(await cli(ctx,'colab-explorer',['open','--ref',nested.data.ref])).data.items.find(item=>item.kind==='session');
  const moved=(await cli(ctx,'colab-explorer',['move','--ref',before.explorerRef,'--parent',rootRef])).data;
  ctx.assert('Move preserves consumer identity',moved.stableRef,shared.stableRef);
  const after=await cli(ctx,'colab-session-reader',['read','--ref',shared.stableRef,'--turn-limit','5']);ctx.assert('Old consumer reference still reads after moving',Array.isArray(after.data.turns),true);
  await ctx.page.getByRole('button',{name:channel.name,exact:true}).click();await ctx.page.getByRole('button',{name:'Add',exact:true}).click();
  ctx.assert('No type tabs remain',await ctx.page.getByRole('tab').count(),0);
  ctx.assert('Channel member entrance is retained',await ctx.page.getByRole('button',{name:'Channel members',exact:true}).count(),1);
  ctx.assert('Quick Share entrance is retained',await ctx.page.getByRole('button',{name:'Quick Share',exact:true}).count(),1);
  await ctx.page.getByRole('heading',{name:channel.name,exact:true}).dblclick();
  await ctx.page.getByRole('dialog').getByLabel('Name',{exact:true}).waitFor();
  ctx.assert('Channel name still opens its real editing Dialog',await ctx.page.getByRole('dialog').count(),1);
  await ctx.page.keyboard.press('Escape');
  await ctx.page.getByRole('button',{name:'Channel members',exact:true}).click();
  await ctx.page.getByRole('dialog').waitFor();
  ctx.assert('Channel AvatarGroup still opens the member Dialog',await ctx.page.getByRole('dialog').count(),1);
  await ctx.page.keyboard.press('Escape');
  await ctx.page.getByRole('button',{name,exact:true}).click();await ctx.page.getByRole('button',{name:'Rename',exact:true}).click();const dialog=ctx.page.getByRole('dialog');await dialog.getByLabel('Name',{exact:true}).fill(name+' renamed');await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await eventually(ctx,'GUI rename persisted through Core and Server',()=>core(ctx,'GET','/v1/channels/'+channel.id+'/catalog-items?limit=200'),rows=>rows.some(item=>item.name===name+' renamed'));
  await ctx.page.reload();await ctx.page.getByRole('heading',{name:name+' renamed',exact:true}).waitFor();await ctx.screenshot('Catalog tree with persistent Channel header and breadcrumb');
 }finally{
  if(shared){const id=shared.stableRef.split('/').at(-1);await core(ctx,'DELETE','/v1/sessions/'+id);}
  if(child)await cli(ctx,'colab-explorer',['remove-catalog','--ref',child.explorerRef]);
  if(root)await cli(ctx,'colab-explorer',['remove-catalog','--ref',root.explorerRef]);
 }
}
