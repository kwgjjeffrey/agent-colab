import {core, parameter, resource} from '../../../support/client.mjs';
export const USECASE = {
  name: 'Join a Channel through the Agent invitation command',
  description: `An owner and a distinct authenticated recipient client exist, and the recipient is not in the bound Channel. Create an invitation, execute the real colab-join entry on the recipient, verify ordinary membership and Channel discovery, repeat safely, then revoke and verify refusal. Invitation expiry is 24 hours. Remove only the membership created by this case and revoke the owned invitation in finally. This covers the real CLI/Core/Server path; first-install bootstrap and GUI opening are separate release acceptance.`,
};
export const META = {
  "id": "channels.members.invite-command",
  "module": "channels/members",
  "surface": "skill",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "read:client.primary",
    "write:client.member",
    "write:membership.fixture"
  ],
  "affectedPaths": [
    "skills/colab/bin/colab-join",
    "desktop/ui/src/features/onboarding/InviteSessionDialog.tsx",
    "packaging/colab-install"
  ],
  "statusReason": "Reviewed Run 20261008T073829Z-801cbe55 Round 3 / 20261008T074030Z-ff700941: real distinct recipient joins exactly once as member, discovers intended Channel, revoked capability is rejected, and membership/invite cleanup verified. First-install/bootstrap GUI opening are not asserted by this case."
};
export const REQUIREMENTS = {channel: {permission:'read'}, parameters:{keys:['secondMemberEmail','secondMemberCoreDiscoveryFile']}};
export async function run(ctx) {
  const channel = resource(ctx,'channel'), email = parameter(ctx,'secondMemberEmail'), discoveryFile = parameter(ctx,'secondMemberCoreDiscoveryFile');
  const route = '/v1/channels/'+channel.id;
  ctx.assert('Recipient is not already in this Channel', !(await core(ctx,'GET',route+'/members')).some(row=>row.email===email), true);
  const invite = await core(ctx,'POST',route+'/invite-links',undefined,{capture:false});
  try {
    const remaining = Date.parse(invite.expiresAt.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00'))-Date.now();
    ctx.assert('Invitation expires in 24 hours (up to 60 seconds client/server clock skew)', Math.abs(remaining-24*3600000)<60000, true);
    for (let index=0;index<2;index++) {
      const result = await ctx.command('Recipient executes real invitation CLI', 'python3',['regression_test/support/join_cli.py'],{input:JSON.stringify({token:invite.token,discoveryFile}),capture:false});
      ctx.assert('Join command succeeds',result.code,0);
      ctx.assert('Receipt identifies intended Channel',JSON.parse(result.stdout).data.channel.id,channel.id);
    }
    const rows = await core(ctx,'GET',route+'/members');
    ctx.assert('Recipient is added exactly once as ordinary member', rows.filter(row=>row.email===email && row.role==='member').length,1);
    ctx.assert('Recipient discovers joined Channel',(await core(ctx,'GET','/v1/channels',undefined,{discoveryFile})).some(row=>row.id===channel.id),true);
    await core(ctx,'DELETE','/v1/invite-links/'+invite.id);
    const denied = await ctx.command('Revoked invitation is rejected', 'python3',['regression_test/support/join_cli.py'],{input:JSON.stringify({token:invite.token,discoveryFile}),capture:false});
    ctx.assert('Revoked invitation cannot be used',denied.code!==0,true);
    ctx.assert('Failure names the invitation rejection',JSON.parse(denied.stdout).error.message.includes('invite_expired_or_revoked'),true);
  } finally {
    await core(ctx,'DELETE','/v1/invite-links/'+invite.id);
    const member = (await core(ctx,'GET',route+'/members')).find(row=>row.email===email);
    if(member) await core(ctx,'DELETE',route+'/members/'+(member.memberId??member.userId));
    ctx.assert('Owned membership is removed',!(await core(ctx,'GET',route+'/members')).some(row=>row.email===email),true);
  }
}
