export const USECASE = {
  "name": "Reject invalid artifacts and recover a failed activation",
  "description": "Purpose: Updater failure must not strand the collaboration installation.\n\nPreconditions: A sandbox updater has a tampered artifact and a candidate with failed health.\n\nActions: Attempt each update and inspect installation state.\n\nExpected results: Digest or signature failures prevent activation; failed health restores the prior usable combination and reports failure.\n\nVariations: report each object type or failure condition independently. Reset its isolated fixture between variations; an earlier failure must not suppress later results."
};

export const META = {
  "id": "platform.updates.rollback",
  "module": "platform/updates",
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
  "statusReason": "Round 3 20261007T102452Z-cbabd0e6: verified signed bad-hash and correctly hashed unhealthy candidates against the real installer in an isolated root. Unhealthy candidate acceptance is a real installer gap (setup explicitly lacks readiness/rollback), not a script false positive. Product defect remains open."
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {setup,receipt,links} from "../../../support/installation.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["baseManifestUrl", "tamperedManifestUrl", "unhealthyManifestUrl", "testServerUrl"]}};
export async function run(ctx){
await setup(ctx,'install',parameter(ctx,'baseManifestUrl'));const before=await receipt(ctx),beforeLinks=await links(ctx);for(const manifest of [parameter(ctx,'tamperedManifestUrl'),parameter(ctx,'unhealthyManifestUrl')]){await setup(ctx,'update',manifest,[],{expectedCode:1});ctx.assert('Failed update preserves prior artifact versions',(await receipt(ctx)).componentVersions,before.componentVersions);ctx.assert('Failed activation restores prior links',await links(ctx),beforeLinks);}
}
