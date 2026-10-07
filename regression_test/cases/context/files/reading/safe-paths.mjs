export const USECASE = {
  "name": "Reject escaping paths during materialization",
  "description": "Purpose: Downloaded trees must not turn context sharing into filesystem escape.\n\nPreconditions: A controlled malformed object manifest includes traversal and escaping symlink paths.\n\nActions: Attempt materialization in an isolated consumer cache.\n\nExpected results: The operation rejects the unsafe object and cannot write or read outside its managed root.\n\nExecution boundary: verify this contract with controlled inputs through its owning API or adapter; a full browser journey is unnecessary."
};

export const META = {
  "id": "context.files.reading.safe-paths",
  "module": "context/files/reading",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "fast",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "contract"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {isolated} from "../../../../support/controls.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["isolationConfirmed", "isolatedCoreDiscoveryFile", "isolatedClientBaseUrl", "unsafeMaterializationFixtures"]}};
export async function run(ctx){
const target=await isolated(ctx),cases=parameter(ctx,'unsafeMaterializationFixtures');ctx.assert('Traversal and escaping symlink variants are configured',cases.some(x=>x.kind==='traversal')&&cases.some(x=>x.kind==='symlink'),true);for(const variant of cases){const before=await fs.readFile(variant.outsideSentinel,'utf8');const denied=await core(ctx,'POST','/v1/files/'+variant.shareId+'/materialize',undefined,{...target,expectFailure:true});ctx.assert(variant.kind+' malformed materialization is rejected',!!denied.error,true);ctx.assert(variant.kind+' cannot overwrite external sentinel',await fs.readFile(variant.outsideSentinel,'utf8'),before);}
}
