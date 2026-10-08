export const USECASE = {
  name: 'Every asset detail keeps workspace navigation and returns to its container',
  description: 'Open real Files, Session, Skill and Canvas fixtures from the mixed root tree. Files preview must not cover the Channel header or directory. Return from each detail using the shared Back entrance and prove Add remains usable. No business data is changed.'
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
    await ctx.page.getByRole('button',{name:target.name,exact:true}).click();
    await ctx.page.getByRole('heading',{name:target.name,exact:true}).waitFor();
    if(kind==='files') {
      await ctx.page.getByRole('tree',{name:target.name+' files',exact:true}).waitFor();
      const nav=ctx.page.getByRole('button',{name:'Add',exact:true});
      await nav.click({trial:true});
      ctx.assert('File preview does not intercept workspace navigation',await nav.isVisible(),true);
      await ctx.page.getByRole('button',{name:'Quick Share',exact:true}).click({trial:true});
    }
    await ctx.page.getByRole('button',{name:'Back to containing catalog',exact:true}).click();
    await ctx.page.getByRole('heading',{name:'Your team is about to work at agentic velocity',exact:true}).waitFor();
    ctx.assert(kind+' returns to a usable Add page',await ctx.page.getByRole('button',{name:'Catalog',exact:true}).isVisible(),true);
  }
  await ctx.screenshot('Asset return navigation retains Channel header and directory');
}
