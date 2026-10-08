import {core, eventually, parameter} from '../../../support/client.mjs';
import {isolated} from '../../../support/controls.mjs';
export const USECASE = {
  name: 'Edit the current account name from global Settings',
  description: 'An explicitly isolated authenticated test client opens bottom-left Settings → Account settings, changes its display name, verifies Server-backed Core profile/status and saved account projection, reloads and observes the persisted name. Reject invalid/identity-spoofing input. Switch to the saved device-account fixture, verify the red Badge, device explanation, hidden placeholder email, name save and optional Google-reminder dismissal without removing the link action. Restore both visible names, account selection and local reminder preference in finally. Name-confirmation flags remain set on the test accounts. This case does not impersonate consent or claim live Google linking.',
};
export const META = {id:'identity.accounts.profile',module:'identity/accounts',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',suite:'business',testLevel:'end-to-end',locks:['write:client.owner'],affectedPaths:['desktop/ui/src/features/account','local/crates/local-api/src/account_profile.rs','server/standalone/crates/persistence/src/account_profile.rs']};
export const REQUIREMENTS = {parameters:{keys:['isolationConfirmed','isolatedCoreDiscoveryFile','isolatedClientBaseUrl','testUserId','testOrganizationId','secondAccountId']}};
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
    const deviceId = parameter(ctx,'secondAccountId');
    await core(ctx,'POST','/v1/auth/switch',{userId:deviceId},target);
    const device = await core(ctx,'GET','/v1/auth/profile',undefined,target);
    const reminderKey = 'colab:google-reminder-dismissed:' + deviceId;
    const oldDismissal = await ctx.page.evaluate(key=>localStorage.getItem(key),reminderKey);
    try {
      ctx.assert('Second fixture is a device-created account',device.googleLinked,false);
      await ctx.page.evaluate(key=>localStorage.removeItem(key),reminderKey);
      await ctx.page.reload();
      await ctx.page.getByRole('button',{name:'Settings',exact:true}).locator('[aria-label="Complete your account settings"]').waitFor();
      await ctx.screenshot('Device account Settings notification');
      await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();
      await ctx.page.getByRole('button',{name:'Account settings',exact:true}).click();
      await ctx.page.getByText(/Your account was created with this device/).waitFor();
      ctx.assert('Internal device email is not shown',await ctx.page.getByText(device.email,{exact:true}).count(),0);
      ctx.assert('Google linkage remains a real available action',await ctx.page.getByRole('button',{name:'Link Google account',exact:true}).isEnabled(),true);
      await ctx.page.getByLabel('Display name',{exact:true}).fill('Acceptance teammate');
      await ctx.page.getByRole('button',{name:'Save name',exact:true}).click();
      await ctx.page.getByText('Name saved.',{exact:true}).waitFor();
      await ctx.page.getByRole('button',{name:'Don’t remind me about Google',exact:true}).click();
      ctx.assert('Completed name and dismissed optional Google reminder clear the Badge',await ctx.page.locator('[aria-label="Complete your account settings"]').count(),0);
      ctx.assert('Dismissing the reminder does not remove Google linking',await ctx.page.getByRole('button',{name:'Link Google account',exact:true}).isVisible(),true);
      await ctx.screenshot('Device account name and optional Google link');
    } finally {
      await core(ctx,'PATCH','/v1/auth/profile',{displayName:device.displayName || 'Test device'},target);
      await ctx.page.evaluate(({key,value})=>{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);},{key:reminderKey,value:oldDismissal});
      await core(ctx,'POST','/v1/auth/switch',{userId:before.id},target);
    }
  } finally {
    await core(ctx,'POST','/v1/auth/switch',{userId:before.id},target);
    await core(ctx,'PATCH','/v1/auth/profile',{displayName:before.displayName || 'Test account'},target);
    ctx.assert('Original visible account name restored',(await core(ctx,'GET','/v1/auth/profile',undefined,target)).displayName,before.displayName || 'Test account');
  }
}
