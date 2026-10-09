import fs from 'node:fs/promises';
import path from 'node:path';
import {core,resource,parameter,disposable} from '../../../../support/client.mjs';
export const USECASE={name:'Publish compressed Session and consume only recent blocks',description:'Using actual candidate contributor/receiver Core and Server, publish an owned >20 MiB transcript whose large tool-output record is in a separate chunk from recent user/agent messages. Assert durable raw-byte progress, Zstd metadata, shared asset-scoped manifest, only the recent frame cached for default preview, structured tail content, and no reconstructed JSONL. Withdraw the owned reference and remove its source fixture. Requires a protocol-2 Server; no compatibility fallback is accepted by this case.'};
export const META={id:'context.sessions.sharing.compressed',module:'context/sessions/sharing',surface:'integration',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',suite:'business',testLevel:'end-to-end',locks:['write:client.owner','write:session.fixture'],requires:['local-core'],affectedPaths:['local/crates/local-api/src/sessions.rs','local/crates/local-api/src/sessions/chunk_cache.rs','server/standalone/crates/api/src/session_indexes.rs']};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','secondCoreDiscoveryFile']}};
export async function run(ctx){
  disposable(ctx);const directory=await fs.mkdtemp(path.join(process.cwd(),'regression_test/.fixtures/session-compressed-'));
  const source=path.join(directory,'source.jsonl'),marker='COMPRESSED_TAIL_'+ctx.runId;
  const receiver={discoveryFile:parameter(ctx,'secondCoreDiscoveryFile'),timeoutSeconds:180};let share;
  try{
    const rows=[
      {type:'response_item',payload:{type:'function_call_output',call_id:'ignored',output:'x'.repeat(20*1024*1024)}},
      {type:'event_msg',payload:{type:'user_message',message:marker}},
      {type:'event_msg',payload:{type:'agent_message',message:'Ready '+marker}},
    ];
    await fs.writeFile(source,rows.map(row=>JSON.stringify(row)+'\n').join(''));
    share=await core(ctx,'POST',`/v1/channels/${resource(ctx,'channel').id}/sessions/share`,{sourcePath:source,sourceAdapter:'codex-jsonl-v1',name:'Compressed Session '+ctx.runId},{timeoutSeconds:180});
    await core(ctx,'POST',`/v1/sessions/${share.id}/sync`,undefined,{timeoutSeconds:180});
    const progress=await core(ctx,'GET',`/v1/sessions/${share.id}/sync-status`);
    ctx.assert('Committed cursor counts original bytes',progress.uploadedBytes,(await fs.stat(source)).size);
    const received=await core(ctx,'POST',`/v1/sessions/${share.id}/sync`,undefined,receiver);
    ctx.assert('Recipient stores a manifest, not reconstructed JSONL',received.rawPath.endsWith('.chunks'),true);
    const manifest=JSON.parse(await fs.readFile(received.rawPath,'utf8'));
    ctx.assert('Record-aligned source publishes multiple blocks',manifest.chunks.length>=2,true);
    ctx.assert('Every newly published block is Zstd',manifest.chunks.every(chunk=>chunk.codec==='zstd'),true);
    ctx.assert('Large repetitive output is compressed',manifest.chunks.reduce((sum,chunk)=>sum+chunk.encodedBytes,0)<progress.uploadedBytes/10,true);
    const dir=path.dirname(received.rawPath);
    ctx.assert('Materialization downloads no transcript blocks before selecting a page',(await fs.readdir(dir)).filter(name=>name.endsWith('.frame')).length,0);
    const preview=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:5},receiver);
    ctx.assert('Recent user and agent content is actually readable',JSON.stringify(preview.turns).includes('Ready '+marker),true);
    ctx.assert('Default preview omits execution output bodies',JSON.stringify(preview.turns).includes('xxxxx'),false);
    const cached=(await fs.readdir(dir)).filter(name=>name.endsWith('.frame'));
    ctx.assert('Preview does not download the historical tool-output block',cached.length<manifest.chunks.length,true);
    ctx.assert('No complete JSONL cache is generated',(await fs.readdir(dir)).some(name=>name.endsWith('.jsonl')),false);
  }finally{
    if(share)await core(ctx,'DELETE',`/v1/sessions/${share.id}`);
    await fs.rm(directory,{recursive:true,force:true});
  }
}
