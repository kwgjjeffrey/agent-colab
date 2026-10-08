export const USECASE={name:'Retry real provider work events after an upload outage',description:'Block only task-event uploads on the owned fault proxy, execute a real Agent task, prove its result finishes while events remain unavailable, restore uploads and verify the same request transcript appears in the GUI.'};
export const META={id:'agents.feedback.work-events-retry',module:'agents/feedback',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['local/crates/local-api/src/work_events.rs','desktop/ui/src/features/agent/AgentWorkDrawer.tsx'],suite:'business',testLevel:'end-to-end',locks:['write:client.owner','write:transport.owner','write:runtime.bound','read:channel.shared','read:agent.blueprint']};
export const REQUIREMENTS={channel:{permission:'read'},agent:{state:'online',capability:'execute'},parameters:{keys:['isolationConfirmed','networkControl','isolatedCoreDiscoveryFile']}};
import {core,eventually} from '../../../support/client.mjs';
import {control} from '../../../support/controls.mjs';
import {invoke,complete} from '../../../support/agent.mjs';
export async function run(ctx){
  await control(ctx,'networkControl','disconnect');
  let task;
  try {
    task=await invoke(ctx,{gui:true});await complete(ctx,task);
    const events=await core(ctx,'GET',`/v1/agent-requests/${task.request.id}/events`,undefined,{capture:false});
    ctx.assert('Uploads are genuinely blocked while result finishes',events.events.length,0);
  } finally {await control(ctx,'networkControl','connect');}
  await eventually(ctx,'Durable outbox retries the same task transcript',()=>core(ctx,'GET',`/v1/agent-requests/${task.request.id}/events`,undefined,{capture:false}),row=>row.events.length>0,{timeoutMs:90000});
  await ctx.page.getByRole('button').filter({hasText:task.agent.name}).filter({hasText:/tasks/}).click();
  await ctx.page.getByLabel('Agent tasks').locator(`[data-request-id="${task.request.id}"]`).click();
  await ctx.page.locator('[data-trace-region="agent-work"]').getByText('REGRESSION_OK',{exact:false}).first().waitFor();
  ctx.assert('Recovered preview shows real request-bound transcript',true,true);
  await ctx.screenshot('Recovered real task work after upload outage');
}
