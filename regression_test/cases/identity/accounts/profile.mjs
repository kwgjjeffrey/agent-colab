import {core, eventually} from '../../../support/client.mjs';
import {isolated} from '../../../support/controls.mjs';
export const USECASE = {
  name: 'Edit the current account name from global Settings',
  description: 'An explicitly isolated authenticated test client opens bottom-left Settings → Account settings, changes its display name, verifies Server-backed Core profile/status and saved account projection, reloads and observes the persisted name. Reject invalid/identity-spoofing input and restore the original name in finally. Google is connected using the existing OAuth entry; this case does not impersonate consent or claim live Google linking.',
};
export const META = {id:'identity.accounts.profile',module:'identity/accounts',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',suite:'business',testLevel:'end-to-end',locks:['write:client.owner'],affectedPaths:['desktop/ui/src/features/account','local/crates/local-api/src/account_profile.rs','server/standalone/crates/persistence/src/account_profile.rs']};
export const REQUIREMENTS = {parameters:{keys:['isolationConfirmed','isolatedCoreDiscoveryFile','isolatedClientBaseUrl','testUserId','testOrganizationId']}};
export async function run(ctx) {
  const target = await isolated(ctx);
  const before = await core(ctx,'GET','/v1/auth/profile',undefined,target);
  const name = 'Colab profile acceptance ' + Date.now();
  try {
    await ctx.page.goto(target.baseUrl);
    await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();
    await ctx.page.getByRole('button',{name:'Account settings',exact:true}).click();
    await ctx.page.getByLabel('Display name',{exact:true}).fill(name);
    await ctx.page.getByRole('button',{name:'Save name',exact:true}).click();
    await ctx.page.getByText('Name saved.',{exact:true}).waitFor();
    const changed = await core(ctx,'GET','/v1/auth/profile',undefined,target);
    ctx.assert('Same account, not a replacement registration',changed.id,before.id);
    ctx.assert('Durable display name',changed.displayName,name);
    ctx.assert('Explicit name recorded',changed.nameCustomized,true);
    ctx.assert('Provider linkage did not change',changed.googleLinked,before.googleLinked);
    await eventually(ctx,'Active session name refreshed',()=>core(ctx,'GET','/v1/auth/status',undefined,target),value=>value.user.displayName===name);
    ctx.assert('Stored account name refreshed',(await core(ctx,'GET','/v1/auth/accounts',undefined,target)).find(x=>x.userId===before.id).displayName,name);
    for (const body of [{displayName:' '},{displayName:'a'.repeat(81)},{displayName:'Bad\nName'},{displayName:'Spoof',userId:'00000000-0000-0000-0000-000000000000'}]) {
      await core(ctx,'PATCH','/v1/auth/profile',body,{...target,expectFailure:true});
    }
    await ctx.page.reload();
    await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();
    await ctx.page.getByRole('button',{name:'Account settings',exact:true}).click();
    ctx.assert('Name survives GUI reload',await ctx.page.getByLabel('Display name',{exact:true}).inputValue(),name);
    await ctx.screenshot('Global account settings with persisted name');
  } finally {
    await core(ctx,'PATCH','/v1/auth/profile',{displayName:before.displayName || 'Test account'},target);
    ctx.assert('Original visible account name restored',(await core(ctx,'GET','/v1/auth/profile',undefined,target)).displayName,before.displayName || 'Test account');
  }
}
