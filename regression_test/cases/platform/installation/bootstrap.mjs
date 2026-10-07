export const USECASE = {
  "name": "Install from a clean supported macOS environment",
  "description": "Purpose: A publicly distributed tool needs a working first-use path.\n\nPreconditions: An isolated supported macOS test installation has no Colab artifacts.\n\nActions: Run the official bootstrap and inspect installed artifacts, receipts and readiness.\n\nExpected results: Verified compatible Core, GUI and Skill install; the optional Shell is not required and the first real operation succeeds."
};

export const META = {
  "id": "platform.installation.bootstrap",
  "module": "platform/installation",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [],
  "affectedPaths": [
    "skills/colab/setup",
    "desktop/ui/src/features/updates"
  ],
  "suite": "release",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 9bb969082631: Real signed product installer in bounded root; immutable cached bytes verified, targets/links checked and installed Core booted. Cold network download not qualified."
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {setup,receipt,links,installRoot} from "../../../support/installation.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["releaseManifestUrl", "testServerUrl"]}};
export async function run(ctx){
await setup(ctx,'install',parameter(ctx,'releaseManifestUrl'),['--agent','codex']);const installed=await receipt(ctx);ctx.assert('Fresh installation has independent artifact versions',['local-core','desktop-ui','colab-skill'].every(k=>!!installed.componentVersions[k]),true);const status=await setup(ctx,'status',parameter(ctx,'releaseManifestUrl'));const value=JSON.parse(status.stdout);ctx.assert('Sandbox Skill is discoverable',value.targets.codex.installed,true);for(const target of Object.values(await links(ctx)))ctx.assert('Activated artifact resolves inside sandbox',path.resolve(installRoot(ctx),'current',target).startsWith(installRoot(ctx)+path.sep),true);const result=await ctx.command('Start installed Core health probe','python3',['regression_test/support/installation_health.py',installRoot(ctx)]);ctx.assert('Downloaded Core is usable',result.code,0);
}
