import fs from 'node:fs/promises';
import path from 'node:path';
import {isolated,control} from '../../../support/controls.mjs';
import {core,resource,parameter,disposable,eventually} from '../../../support/client.mjs';
export const USECASE={name:'Session preview survives failed and slow independent publication',description:'Use an owned 16 MiB provider transcript and dedicated real-forwarding fault proxy. Fail only publication, read local preview and report failed sync without advancing upload. Resume a throttled upload exceeding the old 30-second metadata deadline, navigate away from preview, and verify full durable progress and receiver content. Withdraw the owned share and restore the dedicated proxy. Injected delay is functional timeout-policy evidence, not a performance budget.'};
export const META={
  "id": "sessions.sync.preview-independent",
  "module": "context/sessions/sync",
  "surface": "gui",
  "priority": "critical",
  "origin": "bug",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "write:client.owner",
    "write:browser.loopback-auth",
    "write:session.fixture",
    "write:transport.session-fault"
  ],
  "affectedPaths": [
    "local/crates/local-api/src/sessions.rs",
    "server/standalone/crates/api/src/session_upload.rs",
    "desktop/ui/src/features/sessions/SessionPreview.tsx"
  ],
  "statusReason": "Reviewed Core106 GUI157 Round 20261009T160833Z-48b7963b: 30 assertions; publication failure leaves readable native GUI preview and zero uploaded cursor; fixed body delay exceeds30s; off-preview sync completes exact raw cursor and receiver tail, local pinned cursor survives; proxy restored and owned reference withdrawn."
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','isolationConfirmed','isolatedCoreDiscoveryFile','isolatedClientBaseUrl','testUserId','testOrganizationId','secondCoreDiscoveryFile']}};
export async function run(ctx){
  disposable(ctx); const target=await isolated(ctx),channel=resource(ctx,'channel');
  const directory=await fs.mkdtemp(path.join(process.cwd(),'regression_test/.fixtures/session-independent-'));
  const source=path.join(directory,'session.jsonl'),marker='INDEPENDENT_PREVIEW_'+ctx.runId;
  let share,publication;
  try{
    const file=await fs.open(source,'w');
    try{
      const padding='x'.repeat(256*1024);
      for(let index=0;index<64;index++)await file.write(JSON.stringify({type:'response_item',payload:{type:'function_call_output',call_id:'fixture-'+index,output:padding}})+'\n');
      for(let index=0;index<8;index++)await file.write(JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:marker+'_'+index}]}})+'\n');
    }finally{await file.close();}
    await control(ctx,'networkControl','disconnect');
    share=await core(ctx,'POST',`/v1/channels/${channel.id}/sessions/share`,{sourcePath:source,sourceAdapter:'codex-jsonl-v1',name:'Independent Session '+ctx.runId},target);
    const status=()=>core(ctx,'GET',`/v1/sessions/${share.id}/sync-status`,undefined,target);
    const failed=await eventually(ctx,'Publication failure is observable independently',status,row=>row.state==='failed');
    ctx.assert('No uncommitted upload is claimed',failed.uploadedBytes,0);
    await ctx.page.goto(target.baseUrl);
    await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:channel.name,exact:true}).click();
    await ctx.page.locator(`[data-item-id="${share.id}"][data-item-kind="session"]`).click();
    await ctx.page.getByText(marker+'_7',{exact:true}).waitFor();
    await ctx.page.getByText(/Sync failed — local preview is still available/).waitFor();
    ctx.assert('Preview does not advance the publication cursor',(await status()).uploadedBytes,0);
    const preview=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:5},target);
    ctx.assert('Contributor preview identifies its local view',preview.freshness.cache,'local');
    await ctx.screenshot('Readable Session with failed publication');
    await ctx.command('Throttle owned upload proxy','python3',['regression_test/support/test-control.py','network','slow',ctx.caseId]);
    const started=performance.now();
    publication=core(ctx,'POST',`/v1/sessions/${share.id}/sync`,undefined,{...target,timeoutSeconds:300});
    await ctx.page.getByRole('button',{name:'Home',exact:true}).click();
    await eventually(ctx,'Background publication starts without preview',status,row=>row.state==='syncing');
    const during=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:1},target);
    ctx.assert('Reading during upload still returns local content',JSON.stringify(during.turns).includes(marker+'_7'),true);
    await publication; publication=undefined;
    ctx.assert('Controlled upload outlives old metadata deadline',performance.now()-started>30000,true);
    const complete=await eventually(ctx,'All bytes committed after slow upload',status,row=>row.state==='synced'&&row.uploadedBytes===row.totalBytes,{timeoutMs:240000});
    ctx.assert('Large source exceeds one segment',complete.totalBytes>16*1024*1024,true);
    const received=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:5}, {discoveryFile:parameter(ctx,'secondCoreDiscoveryFile'),timeoutSeconds:300});
    ctx.assert('Recipient reads the actually published final content',JSON.stringify(received.turns).includes(marker+'_7'),true);
    ctx.assert('Recipient sees committed remote snapshot, not contributor preview',received.snapshot.id!==preview.snapshot.id,true);
    const older=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:5,cursor:preview.page.nextCursor},target);
    ctx.assert('Local preview cursor survives concurrent publication',JSON.stringify(older.turns).includes(marker+'_0'),true);
  }finally{
    await control(ctx,'networkControl','connect');
    if(publication)await publication.catch(()=>{});
    if(share)await core(ctx,'DELETE',`/v1/sessions/${share.id}`,undefined,target);
    await fs.rm(directory,{recursive:true,force:true});
  }
}
