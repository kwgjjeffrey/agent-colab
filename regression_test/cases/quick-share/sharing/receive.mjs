export const USECASE = {
  "name": "Receive context without joining the sender's Organization",
  "description": "Purpose: Quick Share must deliver context without establishing collaboration membership.\n\nPreconditions: A valid test capability and a receiver outside the sender's Organization exist.\n\nActions: Run colab-transfer receive and inspect each supplied object type.\n\nExpected results: Files materialize read-only, Session retains its adapter and readable local transcript and Skill is usable through the existing adapter; no login or membership is forced.\n\nVariations: report each object type or failure condition independently. Reset its isolated fixture between variations; an earlier failure must not suppress later results."
};

export const META = {
  "id": "quick-share.consumption.receive",
  "module": "quick-share/sharing",
  "surface": "skill",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 43064293bb73: Actual unauthenticated receiver consumes all three types through CLI; exact source bytes/adapters checked; no login created; transfers revoked."
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {ownedFiles,ownedSession,ownedSkill} from "../../../support/fixtures.mjs";
import {createTransfer,receiveTransfer,revokeTransfer} from "../../../support/transfers.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["anonymousCoreDiscoveryFile"]}};
export async function run(ctx){
const receiver={discoveryFile:parameter(ctx,'anonymousCoreDiscoveryFile')};const status=await core(ctx,'GET','/v1/auth/status',undefined,receiver);ctx.assert('Receiver has no collaboration membership',status.authenticated,false);for(const [kind,sourcePath,sourceAdapter] of [['files',await ownedFiles(ctx),undefined],['session',await ownedSession(ctx),'codex-jsonl-v1'],['skill',await ownedSkill(ctx),undefined]]){const transfer=await createTransfer(ctx,{kind,sourcePath,sourceAdapter,name:'Regression '+kind});try{const command=await ctx.command('Real Colab Skill receives '+kind,'python3',['regression_test/support/transfer_cli.py'],{input:JSON.stringify({capability:transfer.capability,discoveryFile:receiver.discoveryFile}),capture:false});ctx.assert('Receiver CLI succeeds for '+kind,command.code,0);const value=JSON.parse(command.stdout).data;ctx.assert(kind+' is delivered to anonymous recipient',value.items[0].kind,kind);ctx.assert(kind+' has materialized content',(await fs.stat(value.items[0].localPath)).isDirectory()||(await fs.stat(value.items[0].localPath)).isFile(),true);const item=value.items[0];if(kind==='files')ctx.assert('Received Files match producer bytes',await fs.readFile(path.join(item.localPath,'hello.txt'),'utf8'),await fs.readFile(path.join(sourcePath,'hello.txt'),'utf8'));else if(kind==='skill')ctx.assert('Received Skill instructions match source',await fs.readFile(path.join(item.localPath,'SKILL.md'),'utf8'),await fs.readFile(path.join(sourcePath,'SKILL.md'),'utf8'));else{ctx.assert('Session retains the provider adapter',item.sourceAdapter,'codex-jsonl-v1');ctx.assert('Local Session transcript preserves source bytes',await fs.readFile(item.localPath,'utf8'),await fs.readFile(sourcePath,'utf8'));}ctx.assert('Receive does not create login',(await core(ctx,'GET','/v1/auth/status',undefined,receiver)).authenticated,false);}finally{await revokeTransfer(ctx,transfer.transferId);}}
}
