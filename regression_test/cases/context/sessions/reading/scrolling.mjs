export const USECASE = {name:'Recent conversations open at the tail and preserve manual reading',description:'Publish a long owned Codex conversation with typed tool calls; verify the latest five turns, collapsed tools, initial bottom position, manual scroll across discovery refresh, earlier-page anchoring and resizable Channel layout. Verify Message loads the same tail as Core latest pagination.'};
export const META = {
  "id": "context.sessions.reading.scrolling",
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
    "desktop/ui/src/features/messages",
    "desktop/ui/src/features/sessions",
    "desktop/ui/src/features/workspace",
    "local/crates/local-api/src/sessions.rs",
    "server/standalone/crates/persistence/src/messaging.rs"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "read:client.primary",
    "write:channel.shared"
  ],
  "statusReason": "Reviewed Run 20261009T012334Z-0239217b Round 2: real long snapshot, collapsed typed tools, tail/manual scroll/older anchor, sidebar resize and exact Server latest/before/after results pass; owned share withdrawn in finally."
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
import fs from 'node:fs/promises';
import {core,resource,disposable,eventually} from '../../../../support/client.mjs';
import {ownedSession} from '../../../../support/fixtures.mjs';
import {openTab} from '../../../../support/gui.mjs';
export async function run(ctx){
  disposable(ctx); const source=await ownedSession(ctx),channel=resource(ctx,'channel');let share;
  const rows=[];
  for(let i=0;i<12;i++){
    rows.push({type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:`QUESTION_${i}_${ctx.runId}`}]}},
      {type:'response_item',payload:{type:'function_call',name:'shell',call_id:`call-${i}`,arguments:JSON.stringify({command:'echo Tool fixture'})}},
      {type:'response_item',payload:{type:'message',role:'user',content:[{type:'tool_result',tool_use_id:`call-${i}`,content:'Not user prose'}]}},
      {type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:`ANSWER_${i}_${ctx.runId}\n\n`+'A paragraph of representative conversation content.\n\n'.repeat(35)}]}});
  }
  await fs.writeFile(source,rows.map(JSON.stringify).join('\n')+'\n');
  try{
    share=await core(ctx,'POST',`/v1/channels/${channel.id}/sessions/share`,{sourcePath:source,sourceAdapter:'codex-jsonl-v1',name:'Scroll regression '+ctx.runId});
    await eventually(ctx,'Snapshot published',()=>core(ctx,'GET',`/v1/channels/${channel.id}/sessions`),items=>items.some(item=>item.id===share.id&&item.currentSnapshotId),{timeoutMs:90000});
    const read=await core(ctx,'POST',`/v1/sessions/${share.id}/read`,{turnLimit:5,includeOutputs:false});
    ctx.assert('Recent page contains five turns',read.turns.length,5);
    ctx.assert('Tool envelope never appears as user text',JSON.stringify(read.turns).includes('Not user prose'),false);
    await openTab(ctx,'Home');await ctx.page.locator(`[data-item-id="${share.id}"]`).click();
    const preview=ctx.page.locator('[data-trace-region="session-preview"]');
    await preview.getByText(`QUESTION_11_${ctx.runId}`,{exact:true}).waitFor();
    // The library owns an overflow-y-auto child; inspect only its rendered DOM.
    const scroll=preview.locator('.overflow-y-auto');
    await ctx.page.waitForTimeout(500);
    ctx.assert('Initial Session position is the conversation tail',await scroll.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight<5),true);
    ctx.assert('Tool calls are collapsed',await preview.locator('[data-slot="collapsible-trigger"][aria-expanded="false"]').count(),5);
    await scroll.hover();await ctx.page.mouse.wheel(0,-650);await ctx.page.waitForTimeout(300);
    const before=await scroll.evaluate(el=>el.scrollTop);
    await ctx.page.waitForTimeout(6000);
    ctx.assert('Discovery refresh does not reset manual reading',await scroll.evaluate((el,top)=>Math.abs(el.scrollTop-top)<5,before),true);
    await scroll.evaluate(el=>{el.scrollTop=0;});
    await preview.getByRole('button',{name:'Load earlier messages',exact:true}).click();
    await preview.getByText(`QUESTION_2_${ctx.runId}`,{exact:true}).waitFor();
    ctx.assert('Earlier-page load preserves the old content anchor',await scroll.evaluate(el=>el.scrollTop>100),true);
    const sidebar=ctx.page.locator('[aria-label="Channel items"]');
    ctx.assert('Channel header is in the sidebar',await sidebar.getByRole('heading',{name:channel.name,exact:true}).count(),1);
    const handle=ctx.page.getByRole('separator',{name:'Resize Channel sidebar'});await handle.waitFor();
    const width=await sidebar.evaluate(el=>el.getBoundingClientRect().width);
    await handle.focus();await ctx.page.keyboard.press('ArrowRight');
    ctx.assert('Sidebar can be resized',await sidebar.evaluate((el,old)=>el.getBoundingClientRect().width>old,width),true);
    await openTab(ctx,'Messages');const latest=await core(ctx,'GET',`/v1/channels/${channel.id}/messages?latest=true&limit=200`);
    if(!latest.length)ctx.block('Bound Channel needs existing Message history');
    const tail=await core(ctx,'GET',`/v1/channels/${channel.id}/messages?latest=true&limit=3`);
    ctx.assert('Server tail query returns the newest records, not the first page',tail.map(row=>row.id),latest.slice(-3).map(row=>row.id));
    const earlier=await core(ctx,'GET',`/v1/channels/${channel.id}/messages?before=${tail[0].seq}&limit=3`);
    ctx.assert('Backward cursor returns the previous page chronologically',earlier.map(row=>row.id),latest.slice(-6,-3).map(row=>row.id));
    const forward=await core(ctx,'GET',`/v1/channels/${channel.id}/messages?after=${tail[0].seq}&limit=3`);
    ctx.assert('Existing forward catch-up remains compatible',forward.map(row=>row.id),tail.slice(1).map(row=>row.id));
    await ctx.page.locator(`#message-${latest.at(-1).id}`).waitFor();await ctx.page.waitForTimeout(500);
    ctx.assert('Message opens at the tail',await ctx.page.locator('[data-message-timeline]').evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight<5),true);
    await ctx.screenshot('Compact Channel and tail-loaded conversation');
  } finally {if(share)await core(ctx,'DELETE',`/v1/sessions/${share.id}`);}
}
