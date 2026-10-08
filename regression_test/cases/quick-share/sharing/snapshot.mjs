export const USECASE = {
  "name": "Create a fixed Quick Share snapshot",
  "description": "Purpose: One-time handoff has a different lifetime from Channel sharing.\n\nPreconditions: Disposable Files, Session and Skill fixture sources exist.\n\nActions: Select sources, set expiry and create a Quick Share; then change the sources.\n\nExpected results: The returned share represents the selected snapshot and does not follow later source updates or grant Channel membership."
};

export const META = {
  "id": "quick-share.creation.snapshot",
  "module": "quick-share/sharing",
  "surface": "gui",
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
  "statusReason": "Reviewed 20261007T141635Z-ef5ef721: GUI creates Files, real Agent Session, and owned Skill fixed shares; receiver preserves original content and excludes subsequent source changes for all three. Source bytes and transfer revocation cleanup verified. Prior empty-response error did not reproduce on current runtime.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:runtime.bound",
    "read:agent.blueprint",
    "write:skill.fixture",
    "write:files.fixture",
    "write:session.fixture",
    "write:skill.installation",
    "read:client.owner",
    "read:browser.navigation"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {ownedFiles} from "../../../support/fixtures.mjs";
import {openTab} from "../../../support/gui.mjs";
import {withPathSelection} from "../../../support/selection.mjs";
import {receiveTransfer,revokeTransfer} from "../../../support/transfers.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent":{"state":"online","capability":"execute"}, "parameters": {"keys": ["nativeChooserBoundary", "disposable", "skillRef", "skillTarget"]}};
export async function run(ctx){
const sources=await quickShareSources(ctx),failures=[];await openTab(ctx,'Messages');for(const source of sources){let transfer,original;const marker='AFTER_SNAPSHOT_'+ctx.runId+'_'+source.kind;try{const file=source.kind==='files'?path.join(source.sourcePath,'hello.txt'):source.kind==='skill'?path.join(source.sourcePath,'SKILL.md'):source.sourcePath;original=await fs.readFile(file,'utf8');await ctx.page.getByRole('button',{name:'Quick Share',exact:true}).click();await ctx.page.getByRole('menuitem',{name:source.kind==='files'?'Share Files':source.kind==='session'?'Share a Session':'Share a Skill',exact:true}).click();const response=ctx.page.waitForResponse(r=>r.url().endsWith('/v1/transfers')&&r.request().method()==='POST');if(source.kind==='files'){await withPathSelection(ctx,source.sourcePath,()=>ctx.page.getByRole('dialog').getByRole('button',{name:'Choose Files',exact:true}).click());}else{await ctx.page.getByRole('dialog').getByPlaceholder('Search local '+(source.kind==='session'?'Sessions':'Skills')).fill(source.kind==='session'?source.threadId:source.name);await ctx.page.getByRole('dialog').getByRole('button').filter({hasText:source.sourcePath}).click();}transfer=await (await response).json();await ctx.page.getByRole('dialog').press('Escape');ctx.assert(source.kind+' GUI produces a real fixed share',!!transfer.transferId,true);if(source.kind==='session'){const task=await invoke(ctx,{query:'Reply REGRESSION_OK. Do not change files. '+marker});await complete(ctx,task);ctx.assert('Real runtime naturally appends the later Session input',(await fs.readFile(file,'utf8')).includes(marker),true);}else await fs.writeFile(file,original+'\n'+marker+'\n');const received=await receiveTransfer(ctx,transfer.capability);ctx.assert('Receiver obtains the selected '+source.kind,received.items[0].kind,source.kind);const local=source.kind==='session'?received.items[0].localPath:path.join(received.items[0].localPath,source.kind==='files'?'hello.txt':'SKILL.md');const captured=await fs.readFile(local,'utf8');ctx.assert(source.kind+' fixed snapshot excludes the later source change',!captured.includes(marker),true);ctx.assert(source.kind+' preserves the original source content',source.kind==='session'?captured.includes('REGRESSION_OK'):captured===original,true);}catch(error){failures.push(error);}finally{await ctx.page.getByRole('dialog').press('Escape').catch(()=>{});if(original&&source.kind==='skill')await fs.writeFile(path.join(source.sourcePath,'SKILL.md'),original);if(transfer?.transferId)await revokeTransfer(ctx,transfer.transferId);}}if(failures.length)throw failures[0];
}

import {quickShareSources} from "../../../support/quick_share_sources.mjs";
import {invoke,complete} from "../../../support/agent.mjs";
