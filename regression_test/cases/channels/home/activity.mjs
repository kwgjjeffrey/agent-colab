export const USECASE = {
  "name": "Number Home activity pages and hide the empty module",
  "description": "Purpose: Home should orient a user without manufacturing activity or loading all content.\n\nPreconditions: A Channel has shared context, successful reads and Canvas or Agent activity.\n\nActions: Open Home, page recent activity and follow an entry.\n\nExpected results: Entries reflect real metadata, pagination has no duplicates, and links open the intended resource without prefetching full context."
};

export const META = {
  "id": "collaboration.home.activity",
  "module": "channels/home",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser",
    "desktop/ui/src/features/onboarding",
    "server/standalone/crates/persistence/src/activity.rs",
    "server/standalone/crates/api/src/activity.rs"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed GUI 0.1.146-dev / Server 0.1.6 Round 20261009T063306Z-c71c7f8a with timeoutMs 180000: all 72 assertions passed, including empty module hiding, Home ordering, bounded 20+5 numbered pages, exact total, legacy cursor compatibility, real resource navigation and all owned cleanup. The default 60-second setup/cleanup timeout and two manually archived owned remnants remain recorded.",
  "locks": [
    "read:client.primary",
    "write:channel.shared"
  ]
};

import {openTab} from '../../../support/gui.mjs';
import {core,resource,disposable} from '../../../support/client.mjs';
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
export async function run(ctx){
 disposable(ctx);const bound=resource(ctx,'channel'),name='Regression Home pagination '+bound.id.slice(0,8),created=[];let channel;
 const channels=await core(ctx,'GET','/v1/channels');channel=channels.find(row=>row.name===name);if(!channel){channel=await core(ctx,'POST','/v1/channels',{name});const welcome=await core(ctx,'GET','/v1/channels/'+channel.id+'/canvases');for(const doc of welcome)await core(ctx,'DELETE','/v1/canvases/'+doc.id);}
 const base='/v1/channels/'+channel.id;const empty=await core(ctx,'GET',base+'/activity?limit=20&page=1');if(empty.total!==0)ctx.block('Reusable Home pagination fixture must be empty; never delete unowned activity');
 try{
 await ctx.page.reload();await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:channel.name,exact:true}).click();const sidebar=ctx.page.locator('[aria-label="Channel items"]');await sidebar.getByRole('button',{name:'Home',exact:true}).click();const emptyResponse=ctx.page.waitForResponse(r=>new URL(r.url()).pathname===base+'/activity');await ctx.page.reload();await emptyResponse;await ctx.page.getByRole('button',{name:'Call my Agent',exact:true}).waitFor();ctx.assert('Empty activity hides entire module',await ctx.page.getByRole('region',{name:'Recent activity',exact:true}).count(),0);await ctx.screenshot('Empty Home has banner and onboarding only');
 for(let index=0;index<25;index++)created.push(await core(ctx,'POST',base+'/canvases',{title:'Activity '+ctx.runId+' '+index}));
 const first=await core(ctx,'GET',base+'/activity?limit=20&page=1'),second=await core(ctx,'GET',base+'/activity?limit=20&page=2');ctx.assert('Numbered activity exposes exact total',first.total,25);ctx.assert('First API page is bounded',first.items.length,20);ctx.assert('Second API page contains remainder',second.items.length,5);ctx.assert('Numbered pages do not duplicate identities',second.items.every(row=>!first.items.some(other=>other.id===row.id)),true);ctx.assert('Last page clamp preserves real total',(await core(ctx,'GET',base+'/activity?limit=20&page=999')).page,2);
 const legacy=await core(ctx,'GET',base+'/activity?limit=1');ctx.assert('Existing cursor interface remains compatible',Boolean(legacy.nextCursor),true);
 const paths=[];const listener=request=>paths.push(new URL(request.url()).pathname);ctx.page.on('request',listener);const populatedResponse=ctx.page.waitForResponse(r=>new URL(r.url()).pathname===base+'/activity');await ctx.page.reload();await populatedResponse;const activity=ctx.page.getByRole('region',{name:'Recent activity',exact:true});await activity.getByText('25 activities',{exact:true}).waitFor();ctx.page.off('request',listener);ctx.assert('Home loads only bounded metadata',paths.some(path=>/\/canvases\/[^/]+\/document$|\/files\/[^/]+\/(content|raw)$|\/sessions\/[^/]+\/read$/.test(path)),false);ctx.assert('GUI first page contains 20 activities',await activity.getByRole('link').count(),20);ctx.assert('Load more is removed',await activity.getByRole('button',{name:'Load more',exact:true}).count(),0);
 const order=await ctx.page.evaluate(()=>{const elements=[document.querySelector('.home-network-strip'),document.querySelector('[aria-label="Recent activity"]'),document.querySelector('[aria-label="Channel actions"]'),Array.from(document.querySelectorAll('button')).find(node=>node.textContent.trim()==='Use cases')];return elements.every((node,index)=>node&&(index===0||Boolean(elements[index-1].compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)));});ctx.assert('Home order is banner activity actions scenarios',order,true);await ctx.screenshot('Home activity before guides with numeric pages');
 const response2=ctx.page.waitForResponse(r=>new URL(r.url()).pathname===base+'/activity'&&new URL(r.url()).searchParams.get('page')==='2');await activity.getByRole('button',{name:'Activity page 2',exact:true}).click();await response2;await ctx.page.waitForFunction(()=>document.querySelector('[aria-label="Activity page 2"]')?.getAttribute('aria-current')==='page');ctx.assert('GUI page 2 replaces page 1',await activity.getByRole('link').count(),5);ctx.assert('GUI page 2 marks current number',await activity.getByRole('button',{name:'Activity page 2',exact:true}).getAttribute('aria-current'),'page');await ctx.screenshot('Five activities on numbered second page');
 const response1=ctx.page.waitForResponse(r=>new URL(r.url()).pathname===base+'/activity'&&new URL(r.url()).searchParams.get('page')==='1');await activity.getByRole('button',{name:'Activity page 1',exact:true}).click();await response1;const link=activity.getByRole('link',{name:new RegExp('created '+created.at(-1).title+'$')});await link.waitFor();await link.click();await ctx.page.locator('[contenteditable="true"]').waitFor();const title=ctx.page.locator('nav[aria-label="breadcrumb"]').getByText(created.at(-1).title,{exact:true});await title.waitFor();ctx.assert('Activity opens exact owned Canvas',await title.innerText(),created.at(-1).title);
 }finally{for(const doc of created)await core(ctx,'DELETE','/v1/canvases/'+doc.id);if(channel)ctx.assert('Owned pagination activities cleaned up',(await core(ctx,'GET',base+'/activity?limit=20&page=1')).total,0);}
}
