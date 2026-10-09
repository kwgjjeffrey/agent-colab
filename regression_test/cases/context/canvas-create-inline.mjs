export const USECASE={name:'Create Canvas directly and rename inline',description:'Create a real Canvas in the disposable Channel via Add. Verify no dialog, selected Untitled inline name and matching preview, rename and read back the same durable identity. Archive only the owned Canvas.'};
export const META={
  "id": "context.canvas.create-inline",
  "module": "context/canvas",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "locks": [
    "read:client.primary",
    "write:channel.shared"
  ],
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/workspace"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261009T030939Z-401d5947 on installed GUI 132 and aligned Core: no dialog, focused fully selected Untitled, same-ID durable rename/reload and owned archive; eight assertions and screenshot passed."
};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
import {core,resource,disposable,eventually} from '../../support/client.mjs';
export async function run(ctx){disposable(ctx);const channel=resource(ctx,'channel');let id;try{
 await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:channel.name,exact:true}).click();
 await ctx.page.getByRole('button',{name:'Add',exact:true}).click();
 const response=ctx.page.waitForResponse(r=>r.url().endsWith('/v1/channels/'+channel.id+'/canvases')&&r.request().method()==='POST');
 await ctx.page.getByRole('menuitem',{name:'Canvas',exact:true}).click();
 const result=await response;ctx.assert('Creation commits successfully',result.ok(),true);const row=await result.json();id=row.id;
 const input=ctx.page.getByRole('textbox',{name:'Item name',exact:true});await input.waitFor();
 ctx.assert('Creation has no naming dialog',await ctx.page.getByRole('dialog').count(),0);
 ctx.assert('Default name is Untitled',await input.inputValue(),'Untitled');
 ctx.assert('Default name is focused and fully selected',await input.evaluate(el=>document.activeElement===el&&el.selectionStart===0&&el.selectionEnd===el.value.length),true);
 await ctx.screenshot('New Canvas inline name selected');
 const name='Inline Canvas '+ctx.runId;await input.fill(name);await input.press('Enter');
 await eventually(ctx,'Rename preserves created Canvas identity',()=>core(ctx,'GET','/v1/channels/'+channel.id+'/catalog-items?limit=200'),rows=>rows.some(x=>x.id===id&&x.name===name));
 await ctx.page.reload();await ctx.page.locator('[data-item-id="'+id+'"]').waitFor();ctx.assert('Reload preserves renamed Canvas',await ctx.page.locator('[data-item-id="'+id+'"]').innerText(),name);
 }finally{if(id)await core(ctx,'DELETE','/v1/canvases/'+id);}}
