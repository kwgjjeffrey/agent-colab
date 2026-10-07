import {fixtures} from '../../../../support/fixtures.mjs';
import {openTab} from '../../../../support/gui.mjs';
export const USECASE = {
  "name": "Withdraw a shared Skill without removing unrelated installations",
  "description": "Purpose: Publication revocation is distinct from remote removal of downloaded capabilities.\n\nPreconditions: An owned Skill share and a receiver's existing managed installation exist.\n\nActions: Withdraw the shared source and attempt a fresh install or update as the receiver.\n\nExpected results: New source fetches are denied; existing local installations and other shared Skills are not silently erased."
};

export const META = {
  "id": "context.skills.sharing.withdraw",
  "module": "context/skills/sharing",
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
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";
import {item} from "../../../../support/gui.mjs";
export async function run(ctx){
disposable(ctx);const f=await fixtures(ctx),c=resource(ctx,'channel');const share=await core(ctx,'POST','/v1/channels/'+c.id+'/skills/share',{sourcePath:f.skill});await eventually(ctx,'Owned Skill withdrawal fixture is published',()=>core(ctx,'GET','/v1/channels/'+c.id+'/skills'),rows=>rows.some(x=>x.id===share.id&&x.currentRootOid),{timeoutMs:90000});const id=share.id,second=parameter(ctx,'secondCoreDiscoveryFile'),target=parameter(ctx,'skillTarget');const receipt=await core(ctx,'POST','/v1/skills/'+id+'/targets/'+target+'/ensure',undefined,{discoveryFile:second});const original=await fs.readFile(receipt.installedPath+'/SKILL.md','utf8');await openTab(ctx,'Skills');const row=ctx.page.locator('div.group').filter({hasText:share.name});await row.waitFor();await row.getByRole('button',{name:'Withdraw',exact:true}).click();await eventually(ctx,'Skill leaves active discovery',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/skills'),rows=>!rows.some(s=>s.id===id));const denied=await core(ctx,'POST','/v1/skills/'+id+'/targets/'+target+'/ensure',undefined,{discoveryFile:parameter(ctx,'isolatedCoreDiscoveryFile'),expectFailure:true});ctx.assert('Fresh receiver fetch is denied',/HTTP (403|404)/.test(denied.error),true);ctx.assert('Previously installed local bytes remain',await fs.readFile(receipt.installedPath+'/SKILL.md','utf8'),original);
}
export const REQUIREMENTS={"parameters": {"keys": ["disposable", "skillRef", "skillName", "skillTarget", "secondCoreDiscoveryFile", "isolatedCoreDiscoveryFile"]}};
