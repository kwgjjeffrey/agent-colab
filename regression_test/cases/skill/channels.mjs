export const USECASE={name:'Discover accessible Channels through Colab Skill',description:`Preconditions: Local Core is running and signed in.
Action: run the real colab-browser open --ref colab:// command.
Expected: command exits successfully and returns a JSON result. The registered browser.open end-to-end trace is recorded. A performance budget is asserted only when channelDiscoveryMaximumMs is explicitly configured.`};
export const META={
  "id": "skill.channels.discover",
  "module": "channels/discovery",
  "surface": "skill",
  "priority": "critical",
  "suite": "business",
  "testLevel": "end-to-end",
  "origin": "requirement",
  "status": "active",
  "covers": [
    "browser.open"
  ],
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "skills/colab"
  ],
  "effects": "read-only",
  "locks": [
    "read:client.primary",
    "read:channel.shared"
  ],
  "cost": "fast",
  "statusReason": "Round 7 20261007T121017Z-7da12c1e: real CLI output uses public Channel ref/name contract, verified bound Channel and successful exit."
};
export const REQUIREMENTS={"channel": {"permission": "read"}};
export async function run(ctx){const r=await ctx.measure('CLI discovery to output and exit',()=>ctx.command('Discover Channels','python3',['skills/colab/bin/colab-browser','open','--ref','colab://']));if(ctx.parameters.channelDiscoveryMaximumMs!==undefined)await ctx.performance("Channel discovery end-to-end budget",{entryId:"browser.open",maximumMs:ctx.parameters.channelDiscoveryMaximumMs});ctx.assert('Command exits successfully',r.code,0);const value=JSON.parse(r.stdout);ctx.assert('JSON result is an object',typeof value,'object');ctx.assert('Result is successful',value.ok,true);ctx.assert('Accessible bound Channel is listed',Array.isArray(value.data)&&value.data.some(x=>x.kind==='channel'&&x.name===ctx.resources.channel.name&&x.ref==='colab://channel/'+encodeURIComponent(ctx.resources.channel.name)),true);}
