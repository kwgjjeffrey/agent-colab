import { core, eventually, parameter } from '../../../support/client.mjs';
import { isolated } from '../../../support/controls.mjs';
export const USECASE = {
  name: 'Upload and reset a persistent account avatar',
  description: 'An isolated account uploads an actual PNG through Account settings. Verify bounded 256px JPEG persisted by Server through Core, session/account projection, displayed image and reload. Reject unsafe SVG/URL/oversize payloads without modifying the avatar. Restore initials and check matching palette; restore original fixture image in finally. Explicit customization remains recorded on this disposable account. Google-login preservation is covered by isolated persistence acceptance, not fake GUI consent.',
};
export const META = {
  "id": "identity.accounts.avatar",
  "module": "identity/accounts",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "write:client.owner"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/account",
    "desktop/ui/src/components/ui/avatar.tsx",
    "server/standalone/crates/api/src/account_profile.rs",
    "server/standalone/crates/persistence/src/account_profile.rs"
  ],
  "statusReason": "Reviewed GUI 132 Round 20261009T031400Z-16ed1cc7: real PNG upload, 256px JPEG decode, Server/Core projections and reload, rejected unsafe input, initials reset/palette/white contrast, and fixture restoration; prior environment blockers retained in Run 20261009T030620Z-362f57b8."
};
export const REQUIREMENTS = {parameters:{keys:['isolationConfirmed','isolatedCoreDiscoveryFile','isolatedClientBaseUrl','testUserId','testOrganizationId','secondAccountId']}};
export async function run(ctx) {
  const target = await isolated(ctx);
  const original = await core(ctx,'GET','/v1/auth/profile',undefined,target);
  await core(ctx,'POST','/v1/auth/switch',{userId:parameter(ctx,'secondAccountId')},target);
  const before = await core(ctx,'GET','/v1/auth/profile',undefined,target);
  const open = async () => {
    await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();
    await ctx.page.getByRole('button',{name:'Account settings',exact:true}).click();
  };
  try {
    if (before.avatarUrl && !before.avatarUrl.startsWith('data:image/jpeg;base64,')) ctx.block('Avatar fixture must have initials or a restorable customized JPEG');
    await ctx.page.goto(target.baseUrl); await open();
    const png = await ctx.page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width=500; canvas.height=300;
      const context=canvas.getContext('2d'); context.fillStyle='#355C7D';context.fillRect(0,0,500,300);
      context.fillStyle='#ffffff';context.fillRect(200,100,100,100);return canvas.toDataURL('image/png').split(',')[1];
    });
    await ctx.page.getByLabel('Upload avatar',{exact:true}).setInputFiles({name:'owned-avatar.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await ctx.page.getByText('Avatar saved.',{exact:true}).waitFor();
    const uploaded = await core(ctx,'GET','/v1/auth/profile',undefined,target);
    ctx.assert('Avatar remains bound to the same account',uploaded.id,before.id);
    ctx.assert('Server stored a bounded JPEG',uploaded.avatarUrl.startsWith('data:image/jpeg;base64,')&&uploaded.avatarUrl.length<=90000,true);
    await eventually(ctx,'Active account avatar projection',()=>core(ctx,'GET','/v1/auth/status',undefined,target),value=>value.user.avatarUrl===uploaded.avatarUrl);
    ctx.assert('Saved account avatar projection',(await core(ctx,'GET','/v1/auth/accounts',undefined,target)).find(row=>row.userId===before.id).avatarUrl,uploaded.avatarUrl);
    await ctx.page.reload(); await open();
    const image=ctx.page.getByAltText('Your avatar',{exact:true}); await image.waitFor();
    ctx.assert('Reloaded preview is the uploaded image',await image.getAttribute('src'),uploaded.avatarUrl);
    await image.evaluate(element=>element.decode());
    ctx.assert('Native image codec produced 256px crop',await image.evaluate(element=>[element.naturalWidth,element.naturalHeight]),[256,256]);
    await ctx.screenshot('Account avatar photo settings');
    for (const avatarUrl of ['https://example.test/avatar.jpg','data:image/svg+xml;base64,AAAA','data:image/jpeg;base64,'+'A'.repeat(90000)]) await core(ctx,'PATCH','/v1/auth/profile',{avatarUrl},{...target,expectFailure:true});
    ctx.assert('Invalid input preserves the actual avatar',(await core(ctx,'GET','/v1/auth/profile',undefined,target)).avatarUrl,uploaded.avatarUrl);
    await ctx.page.getByRole('button',{name:'Use initials',exact:true}).click(); await ctx.page.getByText('Avatar saved.',{exact:true}).waitFor();
    await eventually(ctx,'Initials reset is durable',()=>core(ctx,'GET','/v1/auth/profile',undefined,target),value=>value.avatarUrl===null);
    await ctx.page.reload(); await open();
    ctx.assert('Uploaded image removed',await ctx.page.getByAltText('Your avatar',{exact:true}).count(),0);
    const fallback=ctx.page.locator('[data-slot="avatar-fallback"]').last();
    const appearance=await fallback.evaluate(element=>({background:getComputedStyle(element).backgroundColor,foreground:getComputedStyle(element).color}));
    ctx.assert('Initials background uses the shared palette',['rgb(53, 92, 125)','rgb(72, 106, 91)','rgb(102, 85, 140)','rgb(155, 78, 100)','rgb(164, 93, 53)','rgb(56, 111, 117)','rgb(89, 103, 140)','rgb(130, 112, 71)'].includes(appearance.background),true);
    ctx.assert('Initials have contrasting white text',appearance.foreground,'rgb(255, 255, 255)');
    await ctx.screenshot('Account settings with coloured initials');
  } finally {
    try {
      if (!before.avatarUrl || before.avatarUrl.startsWith('data:image/jpeg;base64,')) {
        await core(ctx,'PATCH','/v1/auth/profile',before.avatarUrl?{avatarUrl:before.avatarUrl}:{resetAvatar:true},target);
        ctx.assert('Original fixture avatar restored',(await core(ctx,'GET','/v1/auth/profile',undefined,target)).avatarUrl,before.avatarUrl??null);
      }
    } finally { await core(ctx,'POST','/v1/auth/switch',{userId:original.id},target); }
  }
}
