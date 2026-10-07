export const USECASE = {
  "name": "Share a local directory and expose it to another member",
  "description": "Purpose: Files are a core producer-to-consumer path.\n\nPreconditions: An isolated fixture directory, two test members and a disposable Channel exist.\n\nActions: Share the directory in GUI; have the second member discover and materialize it.\n\nExpected results: Tree and file bytes match the selected source; registration and background sync states are distinguished."
};

export const META = {
  "id": "context.files.sharing.register",
  "module": "context/files/sharing",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "rotten",
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
  "testLevel": "end-to-end",
  "statusReason": "Review found fixture semantics mismatch: another-member scenario uses another device of the same owner. Use distinct authenticated member to verify promised sharing boundary."
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {fixtures} from "../../../../support/fixtures.mjs";
import {shareFiles} from "../../../../support/selection.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondMemberCoreDiscoveryFile", "secondMemberEmail", "nativeChooserBoundary"]}};
export async function run(ctx){return withOtherMember(ctx,async target=>{
const f=await fixtures(ctx),c=resource(ctx,'channel'),second=target.discoveryFile;const share=await shareFiles(ctx,f.files,path.basename(f.files));try{ctx.assert('GUI registers an owned Files item',share.canWithdraw,true);await eventually(ctx,'Background publication becomes consumable',()=>core(ctx,'GET','/v1/channels/'+c.id+'/files'),rows=>rows.some(x=>x.id===share.id&&x.currentRootOid),{timeoutMs:90000});const received=await core(ctx,'POST','/v1/files/'+share.id+'/materialize',undefined,{discoveryFile:second});ctx.assert('Second member obtains exact file bytes',await fs.readFile(path.join(received.localPath,'hello.txt'),'utf8'),'OWNED_TEST_'+ctx.runId);}finally{await core(ctx,'DELETE','/v1/files/'+share.id);}
});}

import {withOtherMember} from '../../../../support/controls.mjs';
