export const USECASE={name:'Clear stale Canvas errors after recovery without another edit',description:'Pause GUI sync responses, retain local edits, restore transport without editing or navigation and verify automatic successful reconciliation clears the error. Own Canvas only.'};
export const META={id:'canvas.recovery.state',module:'canvas/sync',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/canvas/CanvasView.tsx'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','read:channel.shared','write:canvas.collection']};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
import {createDocument,deleteDocument} from '../../../support/canvas.mjs';
import {disposable,core,eventually} from '../../../support/client.mjs';
export async function run(ctx){disposable(ctx);const doc=await createDocument(ctx);const route='**/v1/canvases/'+doc.id+'/updates*';try{
 const editor=ctx.page.locator('[contenteditable=true]').first();
 // Forward the real POST to Core, then simulate a lost response. Durable edits and retries stay real.
 await ctx.page.route(route,async r=>{if(r.request().method()==='POST')await r.fetch();await r.fulfill({status:502,contentType:'application/json',body:'{"error":""}'});});
 await editor.fill('Recovery state '+ctx.runId);
 await ctx.page.getByText('Saved locally · Offline',{exact:true}).waitFor();
 await eventually(ctx,'Core retains the actual edit',()=>core(ctx,'GET','/v1/canvases/'+doc.id+'/document'),r=>r.content.includes(ctx.runId));
 await ctx.screenshot('Offline error before transport recovery');
 await ctx.page.unroute(route);
 await ctx.page.getByText('Synced',{exact:true}).waitFor({timeout:40000});
 ctx.assert('Recovery clears the error without another edit',await ctx.page.getByText('Error: {"error":""}',{exact:true}).count(),0);
 ctx.assert('Recovered Canvas remains selected',await editor.innerText().then(s=>s.includes(ctx.runId)),true);
 const replica=await core(ctx,'GET','/v1/canvases/'+doc.id+'/local-replica');ctx.assert('Recovery confirms no pending durable edits',replica.pending,0);
 await ctx.screenshot('Automatic reconciliation clears stale Offline error');
 }finally{await ctx.page.unroute(route);await deleteDocument(ctx,doc);}}
