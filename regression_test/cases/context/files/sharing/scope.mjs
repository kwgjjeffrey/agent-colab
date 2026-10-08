export const USECASE = {
  "name": "Apply an explicit Files synchronization scope",
  "description": "Purpose: A contributor must control exactly which local context leaves their device.\n\nPreconditions: A fixture directory contains allowed, excluded and large files.\n\nActions: Inspect the proposed scope, exclude selected paths, confirm sharing and inspect consumer bytes.\n\nExpected results: Only the confirmed scope is published; counts and size reflect it and excluded content is absent."
};

export const META = {
  "id": "context.files.sharing.scope",
  "module": "context/files/sharing",
  "surface": "gui",
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
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T111006Z-bdad100c, execution source 1837efa3c2bb: Actual GUI excludes dist; receiver bytes verify included file and absence of excluded file; independent share cleaned.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:client.receiver"
  ]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {fixtures} from "../../../../support/fixtures.mjs";
import {openTab,addItem} from "../../../../support/gui.mjs";
import {withPathSelection} from "../../../../support/selection.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["secondCoreDiscoveryFile", "nativeChooserBoundary"]}};
export async function run(ctx){
const f=await fixtures(ctx);await fs.mkdir(path.join(f.files,'dist'));await fs.writeFile(path.join(f.files,'dist','excluded.txt'),'EXCLUDED_'+ctx.runId);await fs.writeFile(path.join(f.files,'large.bin'),Buffer.alloc(1024*1024,1));await openTab(ctx,'Files');let share;await withPathSelection(ctx,f.files,async()=>{await addItem(ctx,'Files');const d=ctx.page.getByRole('dialog');const candidate=d.getByRole('checkbox').filter({has:ctx.page.locator('input')});const inspection=await core(ctx,'POST','/v1/files/inspect-source',{localPath:f.files,syncExcludes:['dist']});ctx.assert('Scope excludes exactly the fixture file',inspection.excludedFiles,1);ctx.assert('Included counts reflect confirmed scope',inspection.includedFiles,2);const candidateButton=d.getByRole('button',{name:/^dist\//});await candidateButton.waitFor();if(!(await candidateButton.locator('svg').count()))await candidateButton.click();await d.getByRole('button',{name:'Share',exact:true}).click();});const rows=await eventually(ctx,'Scoped share is registered',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/files'),rows=>rows.some(x=>x.name===path.basename(f.files)));share=rows.find(x=>x.name===path.basename(f.files));try{await eventually(ctx,'Scoped publication finishes',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/files'),rows=>rows.some(x=>x.id===share.id&&x.currentRootOid),{timeoutMs:90000});const receipt=await core(ctx,'POST','/v1/files/'+share.id+'/materialize',undefined,{discoveryFile:parameter(ctx,'secondCoreDiscoveryFile')});ctx.assert('Allowed fixture is present',await fs.readFile(path.join(receipt.localPath,'hello.txt'),'utf8'),'OWNED_TEST_'+ctx.runId);ctx.assert('Excluded fixture is absent',await fs.access(path.join(receipt.localPath,'dist','excluded.txt')).then(()=>true,()=>false),false);}finally{await core(ctx,'DELETE','/v1/files/'+share.id);}
}
