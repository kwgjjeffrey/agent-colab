import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {core, resource, disposable, eventually} from '../../support/client.mjs';
import {isolated} from '../../support/controls.mjs';

export const USECASE = {
  name: 'Generate Channel icon handoff applies a real local image',
  description: 'An owned Channel opens Edit Channel. Verify three horizontal icon buttons and immediate standard Agent prompt, exact Channel targeting and supported upload command. Execute that displayed command with an owned decodable PNG through packaged Skill → Core → Server; verify exact persisted bytes, unchanged name, compact hash receipt, decoded GUI image and still-open form reconciliation. Restore original icon. This tests the handoff and upload tools, not a mocked image-generation model.',
};
export const META = {
  "id": "channels.icon-agent",
  "module": "channels/identity",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "write:client.owner",
    "write:channel.shared",
    "write:browser.loopback-auth"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/channels",
    "skills/colab/bin/colab-browser",
    "skills/colab/lib/channel_icons.py"
  ],
  "statusReason": "Reviewed Round 20261009T034014Z-23f572c9 on GUI 135/Core 99: displayed packaged upload command, exact persisted bytes, unchanged name, digest receipt, image decode/reload, form reconciliation and owned restoration; 23 assertions passed."
};
export const REQUIREMENTS = {channel:{permission:'read'},parameters:{keys:['disposable','isolationConfirmed','isolatedCoreDiscoveryFile','isolatedClientBaseUrl','testUserId','testOrganizationId']}};

export async function run(ctx) {
  disposable(ctx);
  const target = await isolated(ctx), channel = resource(ctx,'channel');
  const original = (await core(ctx,'GET','/v1/channels',undefined,target)).find(row=>row.id===channel.id);
  if (!original || !['owner','admin'].includes(original.role)) ctx.block('Bound Channel must be manageable by the isolated owner');
  const directory = await fs.mkdtemp(path.join(process.cwd(),'regression_test/.fixtures/icon-agent-'));
  try {
    await ctx.page.goto(target.baseUrl);
    await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:original.name,exact:true}).click();
    const heading = ctx.page.getByRole('heading',{name:original.name,exact:true});
    await heading.dblclick();
    const form=ctx.page.locator('[data-trace-target~="channels.update"]');
    const buttons = ['Upload image','Generate icon from lib','Generate icon via agent'];
    const boxes = await Promise.all(buttons.map(name=>form.getByRole('button',{name,exact:true}).boundingBox()));
    ctx.assert('Three icon actions share one horizontal row',boxes.every(box=>box && Math.abs(box.y-boxes[0].y)<2),true);
    await ctx.screenshot('Horizontal Channel icon actions');
    await form.getByRole('button',{name:buttons[2],exact:true}).click();
    const dialog = ctx.page.getByRole('dialog').filter({has:ctx.page.getByRole('heading',{name:'Generate Channel icon',exact:true})});
    await dialog.waitFor();
    const prompt=await dialog.locator('pre').innerText();
    const command=prompt.split('\n').find(line=>line.includes(' update-channel '));
    ctx.assert('Prompt targets precise selected Channel',command.includes(`--channel 'colab://channel/${channel.id}'`),true);
    ctx.assert('Prompt uses actual file upload parameter',command.endsWith("--icon-file '<absolute-icon-path>'"),true);
    ctx.assert('No rename in handoff',command.includes('--name'),false);
    ctx.assert('Prompt requires actual image generation and completion evidence',prompt.includes('Use your image-generation capability')&&prompt.includes('image generation alone is not a completed icon update'),true);
    await ctx.screenshot('Channel icon Agent prompt');
    const png=await ctx.page.evaluate(()=>{
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=128;
      const context=canvas.getContext('2d');context.fillStyle='#355c7d';context.fillRect(0,0,128,128);
      context.fillStyle='#ffffff';context.beginPath();context.arc(64,64,30,0,Math.PI*2);context.fill();
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const iconPath=path.join(directory,'generated-icon.png');await fs.writeFile(iconPath,Buffer.from(png,'base64'));
    const executable=path.resolve('dist/colab-skill/0.1.57-dev/bin/colab-browser');
    // Only replace the installed executable with the packaged candidate and the
    // explicit file placeholder. All displayed command arguments remain intact.
    const actual=command.replace(/^\S+/,`python3 '${executable}'`).replace('<absolute-icon-path>',iconPath);
    const result=await ctx.command('Execute displayed Channel icon upload','bash',['-c',actual]);
    ctx.assert('Displayed upload succeeds',result.code,0);
    const receipt=JSON.parse(result.stdout).data;
    ctx.assert('Server confirmed icon mutation',receipt.iconUpdated,true);
    ctx.assert('Receipt hashes actual bytes',receipt.iconSha256,createHash('sha256').update(Buffer.from(png,'base64')).digest('hex'));
    ctx.assert('Receipt does not echo image',result.stdout.includes('data:image'),false);
    const image='data:image/png;base64,'+png;
    const saved=(await core(ctx,'GET','/v1/channels',undefined,target)).find(row=>row.id===channel.id);
    ctx.assert('Exact bytes persisted',saved.icon,image);ctx.assert('Name preserved',saved.name,original.name);
    await ctx.page.keyboard.press('Escape');
    await ctx.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const hidden=form.locator('input[name="icon"]');
    await eventually(ctx,'Open form reconciles the Agent icon',()=>hidden.inputValue(),value=>value===image);
    await form.getByRole('button',{name:'Save changes',exact:true}).click();
    ctx.assert('Manual Save does not restore stale icon',(await core(ctx,'GET','/v1/channels',undefined,target)).find(row=>row.id===channel.id).icon,image);
    await ctx.page.reload();await heading.waitFor();
    const displayed=heading.locator('..').locator('img').first();
    ctx.assert('GUI displays persisted image',await displayed.getAttribute('src'),image);
    await displayed.evaluate(img=>img.decode());
    ctx.assert('Displayed icon decodes',await displayed.evaluate(img=>[img.naturalWidth,img.naturalHeight]),[128,128]);
    await ctx.screenshot('Applied Channel icon after reload');
  } finally {
    await core(ctx,'PATCH','/v1/channels/'+channel.id,{name:original.name,icon:original.icon},target);
    ctx.assert('Owned Channel icon restored',(await core(ctx,'GET','/v1/channels',undefined,target)).find(row=>row.id===channel.id).icon,original.icon);
    await fs.rm(directory,{recursive:true,force:true});
  }
}
