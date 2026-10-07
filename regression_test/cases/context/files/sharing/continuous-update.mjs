export const USECASE = {
  "name": "Propagate an edited source file to its consumer",
  "description": "Purpose: Channel sharing promises ongoing context, not a one-time copy.\n\nPreconditions: A fixture directory is shared and materialized by another member.\n\nActions: Edit the source, wait for published freshness, then refresh the consumer.\n\nExpected results: The consumer obtains the new committed content and version without altering the producer's Git repository."
};

export const META = {
  "id": "context.files.sharing.continuous-update",
  "module": "context/files/sharing",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "trial",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["disposable", "continuousSourceFile", "filesRef", "secondCoreDiscoveryFile"]}};
export async function run(ctx){
disposable(ctx);const file=parameter(ctx,'continuousSourceFile'),id=parameter(ctx,'filesRef').split('/').pop(),second=parameter(ctx,'secondCoreDiscoveryFile'),original=await fs.readFile(file,'utf8'),before=(await core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/files')).find(x=>x.id===id),git=await fs.access(path.join(path.dirname(file),'.git')).then(()=>true,()=>false);try{await fs.writeFile(file,'UPDATED_'+ctx.runId);const published=await eventually(ctx,'Source watcher publishes a new version',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/files'),rows=>rows.some(x=>x.id===id&&x.currentRootOid&&x.currentRootOid!==before.currentRootOid),{timeoutMs:90000});const received=await core(ctx,'POST','/v1/files/'+id+'/materialize',undefined,{discoveryFile:second});ctx.assert('Consumer receives new source bytes',await fs.readFile(path.join(received.localPath,path.basename(file)),'utf8'),'UPDATED_'+ctx.runId);ctx.assert('Producer Git ownership is unchanged',await fs.access(path.join(path.dirname(file),'.git')).then(()=>true,()=>false),git);}finally{await fs.writeFile(file,original);}
}
