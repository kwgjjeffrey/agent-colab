import fs from 'node:fs/promises';
import path from 'node:path';
import {core,resource,parameter,disposable} from '../../../../support/client.mjs';
export const USECASE={name:'Old packaged Core reads new compressed Sessions and new Core reads raw history',description:'Switch only the disposable receiver to packaged pre-compression Core 103. Publish an owned raw Session there, consume it using Core 106, then publish another owned compressed Session using Core 106 and read exact turns with Core 103. Restore receiver Core 106 even on failure and withdraw only owned references. This validates real old-client behavior, not a mock HTTP compatibility response.'};
export const META={
  "id": "context.sessions.sharing.legacy-client",
  "module": "context/sessions/sharing",
  "surface": "integration",
  "priority": "critical",
  "origin": "acceptance-gap",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "write:client.owner",
    "write:client.receiver",
    "write:session.fixture"
  ],
  "affectedPaths": [
    "local/crates/local-api/src/sessions.rs",
    "server/standalone/crates/api/src/main.rs"
  ],
  "statusReason": "Reviewed Round20261009T161241Z-d59c20cf:real Core103 and106 independently publish and consume raw/Zstd data, structured turns exact, original content readable; only owned references withdrawn and receiver restored to106 in finally."
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','isolationConfirmed','secondCoreDiscoveryFile']}};
export async function run(ctx){
 disposable(ctx);if(ctx.parameters.isolationConfirmed!==true)ctx.block('Owned receiver lifecycle permission required');
 const receiver={discoveryFile:parameter(ctx,'secondCoreDiscoveryFile'),timeoutSeconds:180};
 const directory=await fs.mkdtemp(path.join(process.cwd(),'regression_test/.fixtures/session-legacy-'));
 const owned=[];let switched=false;
 try{
  const change=await ctx.command('Use real legacy receiver Core','python3',['regression_test/support/manage-owned-core.py','receiver','0.1.103-dev','0.1.157-dev']);
  ctx.assert('Legacy receiver activation succeeds',change.code,0);switched=true;
  for(const legacyProducer of [true,false]){
   const marker=(legacyProducer?'LEGACY_RAW_':'NEW_ZSTD_')+ctx.runId;
   const source=path.join(directory,legacyProducer?'old.jsonl':'new.jsonl');
   await fs.writeFile(source,[{type:'event_msg',payload:{type:'user_message',message:marker}},{type:'event_msg',payload:{type:'agent_message',message:'Verified '+marker}}].map(row=>JSON.stringify(row)+'\n').join(''));
   const producer=legacyProducer?receiver:{timeoutSeconds:180},consumer=legacyProducer?{timeoutSeconds:180}:receiver;
   const share=await core(ctx,'POST',`/v1/channels/${resource(ctx,'channel').id}/sessions/share`,{sourcePath:source,sourceAdapter:'codex-jsonl-v1',name:marker},producer);owned.push({id:share.id,producer});
   await core(ctx,'POST',`/v1/sessions/${share.id}/sync`,undefined,producer);
   const materialized=await core(ctx,'POST',`/v1/sessions/${share.id}/sync`,undefined,consumer);
   ctx.assert(legacyProducer?'New consumer uses lazy manifest for raw history':'Old consumer obtains compatible raw cache',materialized.rawPath.endsWith(legacyProducer?'.chunks':'.jsonl'),true);
   const expected=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:5},producer);
   const actual=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:5},consumer);
   ctx.assert('Actual cross-version structured turns agree',actual.turns,expected.turns);
   ctx.assert('Actual consumer reads user and agent content',JSON.stringify(actual.turns).includes('Verified '+marker),true);
  }
 }finally{
  try{for(const share of owned)await core(ctx,'DELETE',`/v1/sessions/${share.id}`,undefined,share.producer);}
  finally{
   if(switched){const restored=await ctx.command('Restore candidate receiver Core','python3',['regression_test/support/manage-owned-core.py','receiver','0.1.106-dev','0.1.157-dev']);ctx.assert('Candidate receiver restored',restored.code,0);}
   await fs.rm(directory,{recursive:true,force:true});
  }
 }
}
