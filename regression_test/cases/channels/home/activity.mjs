export const USECASE = {
  "name": "Browse real recent activity and open its resource",
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
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import {openTab} from '../../../support/gui.mjs';
import {core,resource,disposable} from '../../../support/client.mjs';
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
export async function run(ctx){
 disposable(ctx);const channel=resource(ctx,'channel'),created=[];
 try{for(const suffix of ['first','second'])created.push(await core(ctx,'POST','/v1/channels/'+channel.id+'/canvases',{title:'Activity '+ctx.runId+' '+suffix}));
 const first=await core(ctx,'GET','/v1/channels/'+channel.id+'/activity?limit=1');ctx.assert('Activity has a genuine continuation cursor',!!first.nextCursor,true);const next=await core(ctx,'GET','/v1/channels/'+channel.id+'/activity?'+new URLSearchParams({limit:'1',...first.nextCursor}));ctx.assert('Activity pages do not duplicate IDs',next.items.every(x=>!first.items.some(y=>y.id===x.id)),true);ctx.assert('Newest activity names the actual created resource',first.items[0].resourceId,created[1].id);
 const paths=[];const listener=r=>paths.push(new URL(r.url()).pathname);ctx.page.on('request',listener);await openTab(ctx,'Home');const activity=ctx.page.getByRole('region',{name:'Recent activity',exact:true});await activity.getByRole('button',{name:'Refresh',exact:true}).click();const link=activity.getByRole('link',{name:new RegExp('created '+created[1].title+'$')});await link.waitFor();ctx.page.off('request',listener);ctx.assert('Home does not prefetch full resource contents',paths.some(p=>/\/canvases\/[^/]+\/document$|\/files\/[^/]+\/(content|raw)$|\/sessions\/[^/]+\/read$/.test(p)),false);
 const more=activity.getByRole('button',{name:'Load more',exact:true});if(await more.count()){const before=await activity.getByRole('link').count();const response=ctx.page.waitForResponse(r=>new URL(r.url()).pathname==='/v1/channels/'+channel.id+'/activity');await more.click();await response;ctx.assert('GUI retains earlier activity after pagination',await activity.getByRole('link').count()>=before,true);}
 await link.click();await ctx.page.getByRole('tab',{name:'Canvas',exact:true}).waitFor();ctx.assert('Activity opens its exact Canvas',(await ctx.page.getByRole('tab',{name:'Canvas',exact:true}).getAttribute('aria-selected')),'true');const title=ctx.page.getByRole('heading',{name:created[1].title,exact:true});await title.waitFor();ctx.assert('Opened Canvas is the activity resource',await title.innerText(),created[1].title);await ctx.screenshot('Actual activity navigation');
 }finally{for(const doc of created)await core(ctx,'DELETE','/v1/canvases/'+doc.id);}
}
