export const USECASE={name:'Preview a published Session after its original local source disappears',description:'Publish a case-owned Session, move its local source aside, then read the published snapshot through Local Core and the actual GUI. Verify recent conversation text and restore the source in finally. No unrelated transcript is touched.'};
export const META={
  "id": "context.sessions.reading.missing-source",
  "module": "context/sessions/reading",
  "surface": "gui",
  "priority": "critical",
  "origin": "bug",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
  "local/crates/local-api/src/sessions.rs",
  "desktop/ui/src/features/sessions/SessionPreview.tsx",
  "desktop/ui/src/features/workspace"
],
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "read:client.primary",
    "write:channel.shared"
  ],
  "statusReason": "Reviewed October 9 IA migration: exact mixed-item GUI actions, real Core/Server readback, captured traces where enabled and owned cleanup verified; run evidence in docs/validation-plan.md."
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
import fs from 'node:fs/promises';
import {core,resource,disposable,eventually} from '../../../../support/client.mjs';
import {ownedSession} from '../../../../support/fixtures.mjs';
import {openTab} from '../../../../support/gui.mjs';
export async function run(ctx){
 disposable(ctx);const source=await ownedSession(ctx),saved=source+'.saved',channel=resource(ctx,'channel');let share,moved=false;
 try{
  share=await core(ctx,'POST',`/v1/channels/${channel.id}/sessions/share`,{sourcePath:source,sourceAdapter:'codex-jsonl-v1',name:'Missing source '+ctx.runId});
  await eventually(ctx,'Owned Session has a published snapshot',()=>core(ctx,'GET',`/v1/channels/${channel.id}/sessions`),rows=>rows.some(row=>row.id===share.id&&row.currentSnapshotId),{timeoutMs:90000});
  await fs.rename(source,saved);moved=true;
  const result=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:5,includeOutputs:false});
  ctx.assert('Read uses published snapshot without original local source',JSON.stringify(result.turns).includes('ANSWER_3_'+ctx.runId),true);
  await openTab(ctx,'Home');await ctx.page.locator(`[data-item-id="${share.id}"][data-item-kind="session"]`).click();
  const preview=ctx.page.locator('[data-trace-region="session-preview"]');
  await preview.getByText('ANSWER_3_'+ctx.runId,{exact:true}).waitFor();
  ctx.assert('Actual preview renders recent published conversation',await preview.getByRole('alert').count(),0);
  await ctx.screenshot('Published Session preview with missing original source');
 }finally{if(moved)await fs.rename(saved,source);if(share)await core(ctx,'DELETE',`/v1/sessions/${share.id}`);}
}
