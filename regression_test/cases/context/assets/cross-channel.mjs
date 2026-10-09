import fs from 'node:fs/promises';
import path from 'node:path';
import {core,resource,parameter,disposable,eventually} from '../../../support/client.mjs';
import {fixtures} from '../../../support/fixtures.mjs';
export const USECASE={name:'Reuse one owned source across Channels',description:'Register the same owned Files, Skill and Session sources in two disposable Channels. Assert one asset/publication identity and one current version, idempotent re-sharing, shared synchronization scope, local preview without uploading again, continued publication after withdrawing the original reference, and last-reference stop/re-share. Own only the created references and restore them in finally. Server contract tests independently verify byte reachability and authorization.'};
export const META={
  "id": "context.assets.cross-channel",
  "module": "context/assets/sync",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "trial",
  "effects": "isolated-write",
  "cost": "slow",
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "write:client.owner",
    "write:channel.shared",
    "write:channel.secondary"
  ],
  "affectedPaths": [
    "local/crates/local-api/src/assets.rs",
    "server/standalone/crates/persistence/src/assets.rs",
    "server/standalone/migrations/0042_shared_assets.sql"
  ],
  "statusReason": "Reviewed packaged Core 101 Round 20261009T091734Z-1cd6014b in Run 20261009T080837Z-c94ad994: 124 assertions cover concurrent receiver reads, exact initial and updated bytes, one publication/cache, scope preservation, independent withdrawal and final re-share; finally withdrew only owned fixtures. Prior failures retained; B-only authorization and legacy merge separately passed PostgreSQL contract tests."
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','secondDisposableChannelId','secondCoreDiscoveryFile']}};
export async function run(ctx){
 disposable(ctx);const a=resource(ctx,'channel').id,b=parameter(ctx,'secondDisposableChannelId');
 const receiver={discoveryFile:parameter(ctx,'secondCoreDiscoveryFile'),timeoutSeconds:90};
 if(a===b)ctx.block('Two distinct disposable Channels are required');
 const f=await fixtures(ctx),owned=[];
 await fs.mkdir(path.join(f.files,'node_modules'),{recursive:true});
 await fs.writeFile(path.join(f.files,'node_modules','owned-fixture.txt'),'Excluded fixture bytes');
 try{
  for(const kind of ['files','skill','session']){
   const plural=kind==='skill'?'skills':kind==='session'?'sessions':'files';
   const body=kind==='files'?{localPath:f.files,name:'Shared Files '+ctx.runId,syncExcludes:['node_modules']}:kind==='skill'?{sourcePath:f.skill,name:'Shared Skill '+ctx.runId}:{sourcePath:f.session,sourceAdapter:'codex-jsonl-v1',name:'Shared Session '+ctx.runId};
   const create=channel=>core(ctx,'POST',`/v1/channels/${channel}/${plural}/share`,kind==='files'&&channel===b?{...body,syncExcludes:[]}:body,{timeoutSeconds:90});
   const first=await create(a);owned.push({plural,id:first.id});
   if(kind==='files')await core(ctx,'POST',`/v1/files/${first.id}/publish`,undefined,{timeoutSeconds:90});
   if(kind==='session')await core(ctx,'POST',`/v1/sessions/${first.id}/sync`,undefined,{timeoutSeconds:90});
   const firstBinding=await core(ctx,'GET',`/v1/shares/${first.id}/asset`);
   const before=await eventually(ctx,'First asset is durably published',()=>core(ctx,'GET',`/v1/shares/${first.id}/asset`),row=>kind==='session'?Boolean(row.currentSnapshotId):Boolean(row.currentRootOid),{timeoutMs:90000});
   const second=await create(b);owned.push({plural,id:second.id});
   const secondBinding=await core(ctx,'GET',`/v1/shares/${second.id}/asset`);
   ctx.assert(kind+' has one asset',secondBinding.assetId,firstBinding.assetId);
   ctx.assert(kind+' has one publication',secondBinding.publicationId,firstBinding.publicationId);
   ctx.assert(kind+' references remain distinct',first.id!==second.id,true);
   ctx.assert(kind+' has two active references',secondBinding.referenceCount,2);
   ctx.assert(kind+' re-sharing reuses existing bytes',kind==='session'?secondBinding.currentSnapshotId:secondBinding.currentRootOid,kind==='session'?before.currentSnapshotId:before.currentRootOid);
   ctx.assert(kind+' repeated registration is idempotent',(await create(b)).id,second.id);
   await core(ctx,'GET',`/v1/channels/${a}/${plural}`,undefined,receiver);
   await core(ctx,'GET',`/v1/channels/${b}/${plural}`,undefined,receiver);
   const [remoteA,remoteB]=await Promise.all([first,second].map(reference=>core(ctx,'POST',`/v1/${plural}/${reference.id}/${kind==='session'?'sync':'materialize'}`,undefined,receiver)));
   ctx.assert(kind+' receiving Core reuses one materialized copy',kind==='session'?remoteB.rawPath:remoteB.localPath,kind==='session'?remoteA.rawPath:remoteA.localPath);
   if(kind==='session'){
    const options={turnLimit:100,includeOutputs:true};
    const expected=await core(ctx,'POST',`/v1/sessions/${first.id}/read`,options);
    const received=await core(ctx,'POST',`/v1/sessions/${second.id}/read`,options,receiver);
    ctx.assert('Session receiver obtains the exact structured source',received.turns,expected.turns);
    ctx.assert('Session cache is a chunk manifest, not a reconstructed transcript',remoteB.rawPath.endsWith('.chunks'),true);
   }else{
    const receivedFile=kind==='files'?path.join(remoteB.localPath,'hello.txt'):path.join(remoteB.localPath,'SKILL.md');
    const sourceFile=kind==='files'?path.join(f.files,'hello.txt'):path.join(f.skill,'SKILL.md');
    ctx.assert(kind+' receiver obtains the exact source bytes',await fs.readFile(receivedFile,'utf8'),await fs.readFile(sourceFile,'utf8'));
   }
   if(kind==='files')ctx.assert('Excluded dependencies are not published',await fs.access(path.join(remoteB.localPath,'node_modules','owned-fixture.txt')).then(()=>true,()=>false),false);
   if(kind==='files'){
    const scope=await core(ctx,'GET',`/v1/files/${second.id}/sync-scope`);
    ctx.assert('Second reference preserves owned synchronization exclusions',scope.candidates.some(row=>row.pattern==='node_modules'&&row.selected),true);
   }
   if(kind==='session'){
    const preview=await core(ctx,'POST',`/v1/sessions/${second.id}/read`,{turnLimit:1});
    ctx.assert('Second reference previews the original local source',preview.freshness.cache,'local');
    ctx.assert('Second reference shares uploader progress',(await core(ctx,'GET',`/v1/sessions/${second.id}/sync-status`)).contributor,true);
   }
   await core(ctx,'DELETE',`/v1/${plural}/${first.id}`);owned.splice(owned.findIndex(row=>row.id===first.id),1);
   const remaining=await core(ctx,'GET',`/v1/shares/${second.id}/asset`);
   ctx.assert(kind+' withdrawal removes only one placement',remaining.referenceCount,1);
   const marker='REUSED_AFTER_WITHDRAW_'+ctx.runId;
   if(kind==='files')await fs.writeFile(path.join(f.files,'hello.txt'),marker);
   else if(kind==='skill')await fs.appendFile(path.join(f.skill,'SKILL.md'),'\n'+marker+'\n');
   else await fs.appendFile(f.session,JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:marker}]}})+'\n');
   if(kind==='session')await core(ctx,'POST',`/v1/sessions/${second.id}/sync`,undefined,{timeoutSeconds:90});
   const advanced=await eventually(ctx,'Remaining Channel receives the next shared version',()=>core(ctx,'GET',`/v1/shares/${second.id}/asset`),row=>kind==='session'?row.currentSnapshotId!==remaining.currentSnapshotId:row.currentRootOid!==remaining.currentRootOid,{timeoutMs:90000});
   ctx.assert(kind+' new version still belongs to same asset',advanced.assetId,remaining.assetId);
   // Files deliberately serve their existing preview immediately; this assertion asks for
   // the separately committed refresh rather than mistaking stale-while-revalidate for failure.
   const updatedCopy=await core(ctx,'POST',`/v1/${plural}/${second.id}/${kind==='session'?'sync':kind==='files'?'materialize?wait=true':'materialize'}`,undefined,receiver);
   if(kind==='session'){
    const updated=await core(ctx,'POST',`/v1/sessions/${second.id}/read`,{turnLimit:5},receiver);
    ctx.assert('Session receiver reads updated structured content after original withdrawal',JSON.stringify(updated.turns).includes(marker),true);
   }else{
    const updatedFile=kind==='files'?path.join(updatedCopy.localPath,'hello.txt'):path.join(updatedCopy.localPath,'SKILL.md');
    ctx.assert(kind+' receiver obtains updated bytes after original withdrawal',(await fs.readFile(updatedFile,'utf8')).includes(marker),true);
   }
   await core(ctx,'DELETE',`/v1/${plural}/${second.id}`);owned.splice(owned.findIndex(row=>row.id===second.id),1);
   ctx.assert(kind+' last withdrawal leaves no active reference',(await core(ctx,'GET',`/v1/shares/${second.id}/asset`)).referenceCount,0);
   const restored=await create(b);owned.push({plural,id:restored.id});
   const rebound=await core(ctx,'GET',`/v1/shares/${restored.id}/asset`);
   ctx.assert(kind+' re-share retains asset identity',rebound.assetId,firstBinding.assetId);
  }
 }finally{
  for(const row of owned.reverse())await core(ctx,'DELETE',`/v1/${row.plural}/${row.id}`);
  await fs.rm(f.root,{recursive:true,force:true});
 }
}
