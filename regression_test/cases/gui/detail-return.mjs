export const USECASE = {
  name: 'Every asset detail keeps workspace navigation and returns to its container',
  description: 'Open real Files, Session, Skill and Canvas fixtures from the mixed root tree. Assert real preview content, no redundant collection actions or Back controls, and return through the Channel breadcrumb. No business data is changed.'
};
export const META = {id:'gui.details.return',module:'gui/navigation',surface:'gui',priority:'critical',status:'trial',origin:'requirement',effects:'read-only',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/workspace','desktop/ui/src/features/files','desktop/ui/src/main.tsx'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','read:channel.shared']};
export const REQUIREMENTS = {channel:{permission:'read'}};
import {core,resource} from '../../support/client.mjs';
export async function run(ctx) {
  const channel = resource(ctx,'channel');
  await ctx.page.getByRole('button',{name:channel.name,exact:true}).click();
  await ctx.page.getByRole('button',{name:'Add',exact:true}).click();
  const rows = await core(ctx,'GET',`/v1/channels/${channel.id}/catalog-items?limit=200`);
  for(const kind of ['files','session','skill','canvas']) {
    const target = rows.find(item=>item.kind===kind);
    if(!target) ctx.block(`Missing root ${kind} fixture`);
    await ctx.page.locator(`[data-item-id="${target.id}"][data-item-kind="${kind}"]`).click();
    const breadcrumb=ctx.page.locator('section > div nav[aria-label="breadcrumb"]').first();
    await breadcrumb.getByText(target.name,{exact:true}).waitFor();
    ctx.assert(kind+' has no redundant Back control',await ctx.page.getByRole('button',{name:/^Back/}).count(),0);
    if(kind==='files') {
      await ctx.page.getByRole('tree',{name:target.name+' files',exact:true}).waitFor();
      const nav=ctx.page.getByRole('button',{name:'Add',exact:true});
      await nav.click({trial:true});
      ctx.assert('File preview does not intercept workspace navigation',await nav.isVisible(),true);
      await ctx.page.getByRole('button',{name:'Quick Share',exact:true}).click({trial:true});
    }
    if(kind==='skill') {
      await ctx.page.locator('[data-trace-region="skill-preview"]').waitFor();
      ctx.assert('Skill preview contains actual SKILL.md', (await ctx.page.locator('[data-trace-region="skill-preview"]').innerText()).length>20,true);
      ctx.assert('Skill detail has no collection Share button',await ctx.page.getByRole('button',{name:'Share skill',exact:true}).count(),0);
    }
    if(kind==='session') {
      const preview=ctx.page.locator('[data-trace-region="session-preview"]');
      await preview.locator('p.whitespace-pre-wrap').first().waitFor();
      ctx.assert('Session preview contains real message content',(await preview.locator('p.whitespace-pre-wrap').first().innerText()).length>0,true);
      ctx.assert('Session preview has no read error',await preview.getByRole('alert').count(),0);
    }
    await ctx.screenshot(kind+' actual preview and unified trail');
    await breadcrumb.getByRole('button',{name:channel.name,exact:true}).click();
    await ctx.page.getByRole('heading',{name:'Your team is about to work at agentic velocity',exact:true}).waitFor();
    ctx.assert(kind+' returns to a usable Add page',await ctx.page.getByRole('button',{name:'Catalog',exact:true}).isVisible(),true);
  }
  await ctx.screenshot('Asset return navigation retains Channel header and directory');
}
