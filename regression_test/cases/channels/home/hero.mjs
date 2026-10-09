import {openTab} from '../../../support/gui.mjs';
export const USECASE={name:'Official Home animation and background transition',description:'Read the installed Home hero, verify three official network cards, live particles, reduced motion, dark-to-light background and narrow layout. No product data is changed.'};
export const META={
  "id": "channels.home.hero",
  "module": "channels/home",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "fast",
  "suite": "business",
  "testLevel": "end-to-end",
  "locks": [
    "read:client.primary",
    "read:channel.shared"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/onboarding/CollaborationNetwork.tsx",
    "desktop/ui/src/features/onboarding/CollaborationNetwork.css",
    "desktop/ui/src/features/onboarding/ChannelHome.tsx"
  ],
  "statusReason": "Reviewed installed GUI 0.1.147-dev Run 20261009T064721Z-9ecf2890: official cards/captions, dark-to-light gradient, live particles, reduced-motion pause and narrow containment passed; both screenshots reviewed. Read-only, no cleanup required."
};
export const REQUIREMENTS={channel:{permission:'read'}};
export async function run(ctx){
 await openTab(ctx,'Home'); const hero=ctx.page.locator('.home-network-strip');await hero.waitFor();await hero.scrollIntoViewIfNeeded();
 ctx.assert('Three official cards',await hero.locator('figure').count(),3);
 ctx.assert('Official multiplier captions',await hero.locator('.network-multiplier').allTextContents(),['1×','2×','200×']);
 const gradient=await hero.evaluate(el=>getComputedStyle(el).backgroundImage);ctx.assert('Dark to light gradient',gradient.includes('linear-gradient')&&gradient.includes('rgb(16, 20, 17)'),true);
 await ctx.page.emulateMedia({reducedMotion:'no-preference'});
 const packet=hero.locator('[data-packet]').last();const sample=()=>packet.evaluate(el=>[el.getAttribute('cx'),el.getAttribute('cy'),el.getAttribute('style')].join('|'));
 const first=await sample();await ctx.page.waitForTimeout(75);ctx.assert('Particles animate',await sample()!==first,true);await ctx.screenshot('Official Home hero desktop');
 await ctx.page.emulateMedia({reducedMotion:'reduce'});await ctx.page.waitForTimeout(100);const still=await sample();await ctx.page.waitForTimeout(100);ctx.assert('Reduced motion pauses particles',await sample(),still);
 await ctx.page.setViewportSize({width:920,height:900});await hero.scrollIntoViewIfNeeded();
 ctx.assert('Narrow cards stay inside banner',await hero.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('figure')].every(c=>{const r=c.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right+1;});}),true);await ctx.screenshot('Official Home hero narrow reduced motion');
 await ctx.page.emulateMedia({reducedMotion:'no-preference'});
}
