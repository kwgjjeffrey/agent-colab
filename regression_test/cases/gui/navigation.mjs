export const USECASE={name:'Display Channel rail and Messages navigation',description:`Preconditions: the developer GUI adapter and Local Core are running.
Action: open the real GUI in a dedicated Chrome profile through CDP, then inspect the Channel rail and Messages tab.
Expected: Channel controls and exactly one Messages tab are visible. No message is sent, updated or deleted.`};
export const META={
  "id": "gui.channels.navigation",
  "module": "channels/discovery",
  "surface": "gui",
  "priority": "critical",
  "suite": "business",
  "testLevel": "end-to-end",
  "origin": "requirement",
  "status": "active",
  "covers": [
    "channels.list"
  ],
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui"
  ],
  "effects": "read-only",
  "locks": [
    "read:client.primary",
    "read:channel.shared"
  ],
  "cost": "normal",
  "statusReason": "Reviewed Round 20261008T025951Z-a7143d75: four navigation assertions passed including exactly one current Channel matching header; native GUI 106 screenshots verify white marker and outline following selection."
};
export async function run(ctx){await ctx.measure('GUI navigation readiness',async()=>{await ctx.page.getByRole('tab',{name:'Messages',exact:true}).waitFor({timeout:30000});const tabs=await ctx.observe('Messages tab exists',{target:'messages.tab',read:'count'});ctx.assert('One Messages tab is present',tabs,1);const visible=await ctx.page.locator('[aria-label="Channels"]').isVisible();ctx.assert('Channel rail is visible',visible,true);});if(ctx.parameters.guiNavigationMaximumMs!==undefined)await ctx.performance("Channel list end-to-end budget",{entryId:"channels.list",maximumMs:ctx.parameters.guiNavigationMaximumMs});const selected=ctx.page.locator('[aria-label="Channels"] button[aria-current="page"]');ctx.assert('Exactly one Channel is marked current',await selected.count(),1);const name=await selected.getAttribute('aria-label');ctx.assert('Current rail Channel matches header',await ctx.page.getByRole('heading',{name,exact:true}).isVisible(),true);await ctx.screenshot('Colab GUI navigation');}
