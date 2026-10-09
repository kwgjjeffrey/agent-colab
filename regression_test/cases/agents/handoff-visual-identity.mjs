export const META={
  "id": "agents.handoff.visual-identity",
  "module": "agents/handoff",
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
    "desktop/ui/src/features/agent",
    "desktop/ui/src/components/ui/button.tsx",
    "desktop/ui/src/styles.css"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed GUI 0.1.143-dev Round 20261009T055828Z-fb4ce92c: all 38 assertions passed; Canvas/Files/Session/Skill handoffs, ready prompt controls, light/dark Agent palette, manual primary contrast, Messages member handoff and single-message forwarding checked. Screenshots reviewed; owned Canvas archived; no Agent task dispatched."
};
export const USECASE={name:'Distinguish Agent handoffs from manual primary actions',description:'Visit real Canvas, Files, Session and Skill previews. Verify purple Agent action, supernova icon, manual Add contrast, opening the real prompt and Agent launch controls. Check light/dark colors and screenshots without dispatching a task to an Agent. Archive only the owned Canvas.'};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable','filesName','sessionName','skillName']}};
import {core,resource,parameter,disposable} from '../../support/client.mjs';
export async function run(ctx){disposable(ctx);const c=resource(ctx,'channel');let canvas;let originalDark;
 try{canvas=await core(ctx,'POST','/v1/channels/'+c.id+'/canvases',{title:'Agent button '+ctx.runId});const rows=await core(ctx,'GET','/v1/channels/'+c.id+'/catalog-items?limit=200');
 await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:c.name,exact:true}).click();await ctx.page.reload();await ctx.page.locator('[aria-label="Channel items"]').waitFor();originalDark=await ctx.page.evaluate(()=>document.documentElement.classList.contains('dark'));await ctx.page.evaluate(()=>document.documentElement.classList.remove('dark'));
 for(const [kind,name] of [['canvas',canvas.title],['files',parameter(ctx,'filesName')],['session',parameter(ctx,'sessionName')],['skill',parameter(ctx,'skillName')]]){const row=rows.find(x=>x.kind===kind&&x.name===name);ctx.assert(kind+' real fixture exists',Boolean(row),true);await ctx.page.locator('[data-item-id="'+row.id+'"]').click();const give=ctx.page.getByRole('button',{name:'Give to Agent',exact:true});await give.waitFor();ctx.assert(kind+' uses Agent action identity',await give.getAttribute('data-agent-action'),'true');ctx.assert(kind+' includes supernova icon',await give.locator('[data-agent-icon="supernova"]').count(),1);await ctx.page.waitForTimeout(200);const color=await give.evaluate(node=>getComputedStyle(node).backgroundColor);ctx.assert(kind+' purple light theme',color,'rgb(117, 70, 217)');const manual=ctx.page.locator('[aria-label="Channel items"]').getByRole('button',{name:'Add',exact:true});ctx.assert(kind+' differs from manual primary',await manual.evaluate(node=>getComputedStyle(node).backgroundColor)!==color,true);
 await give.click();const prompt=ctx.page.locator('[data-trace-region="prompt"]');await prompt.waitFor();await ctx.page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-trace-region="prompt"] button')).some(node=>node.textContent.trim()==='Copy prompt'&&!node.disabled));const launch=prompt.getByRole('button',{name:/Copy and open /});ctx.assert(kind+' prompt launch uses same Agent identity',await launch.getAttribute('data-agent-action'),'true');ctx.assert(kind+' copy remains manual',await prompt.getByRole('button',{name:'Copy prompt',exact:true}).getAttribute('data-agent-action'),null);await ctx.screenshot(kind+' purple Agent handoff');await prompt.getByRole('button',{name:'Close',exact:true}).click();await ctx.page.waitForFunction(()=>!document.querySelector('[data-trace-region="prompt"]'));
 if(kind==='canvas'){await ctx.page.evaluate(()=>document.documentElement.classList.add('dark'));await ctx.page.waitForTimeout(200);ctx.assert('Agent dark theme preserves contrast',await give.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(183, 152, 255)');await ctx.screenshot('Canvas Agent action dark theme');await ctx.page.evaluate(()=>document.documentElement.classList.remove('dark'));}}
 await ctx.page.locator('[aria-label="Channel items"]').getByRole('button',{name:'Message',exact:true}).click();const participant=ctx.page.locator('[data-trace-region="participants"]').getByRole('button').filter({has:ctx.page.getByText('AI',{exact:true})}).first();await participant.click();const giveMessages=ctx.page.getByRole('button',{name:'Give Messages to Agent',exact:true});await giveMessages.waitFor();ctx.assert('Messages member handoff uses Agent identity',await giveMessages.getAttribute('data-agent-action'),'true');ctx.assert('Messages member handoff includes supernova',await giveMessages.locator('[data-agent-icon="supernova"]').count(),1);await giveMessages.click();const messagePrompt=ctx.page.locator('[data-trace-region="prompt"]');await messagePrompt.waitFor();ctx.assert('Messages Send uses Agent identity',await messagePrompt.getByRole('button',{name:'Send to Agent',exact:true}).getAttribute('data-agent-action'),'true');await ctx.screenshot('Messages Agent handoff');await messagePrompt.getByRole('button',{name:'Close',exact:true}).click();await ctx.page.waitForFunction(()=>!document.querySelector('[data-trace-region="prompt"]'));
 const message=ctx.page.locator('[id^="message-"]').last();await message.hover();const forward=message.getByRole('button',{name:/^Forward /});ctx.assert('Message forward entry uses Agent identity',await forward.getAttribute('data-agent-action'),'true');ctx.assert('Message forward includes supernova',await forward.locator('[data-agent-icon="supernova"]').count(),1);await forward.click();const forwardDialog=ctx.page.getByRole('dialog');await forwardDialog.getByRole('heading',{name:'Forward to Agent',exact:true}).waitFor();ctx.assert('Forward task Send uses Agent identity',await forwardDialog.getByRole('button',{name:'Send to Agent',exact:true}).getAttribute('data-agent-action'),'true');await ctx.screenshot('Forward messages Agent action');await forwardDialog.getByRole('button',{name:'Cancel',exact:true}).click();await ctx.page.waitForFunction(()=>!document.querySelector('[data-slot="dialog-content"]'));

 }finally{if(originalDark!==undefined)await ctx.page.evaluate(value=>document.documentElement.classList.toggle('dark',value),originalDark);if(canvas)await core(ctx,'DELETE','/v1/canvases/'+canvas.id);}}
