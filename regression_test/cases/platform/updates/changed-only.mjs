export const USECASE = {
  "name": "Update only changed client artifacts",
  "description": "Purpose: Independent release units must remain independent during update.\n\nPreconditions: A sandbox install has a controlled release with one changed component.\n\nActions: Apply the update and inspect active versions, receipts and health.\n\nExpected results: Only changed artifacts are replaced; unchanged Shell and other versions remain unchanged; readiness succeeds."
};

export const META = {
  "id": "platform.updates.changed-only",
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
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {setup,receipt,links} from "../../../support/installation.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["baseManifestUrl", "singleComponentManifestUrl", "changedComponent", "testServerUrl"]}};
export async function run(ctx){
await setup(ctx,'install',parameter(ctx,'baseManifestUrl'));const before=await receipt(ctx),beforeLinks=await links(ctx);await setup(ctx,'update',parameter(ctx,'singleComponentManifestUrl'));const after=await receipt(ctx),afterLinks=await links(ctx),changed=parameter(ctx,'changedComponent');const difference=Object.keys(after.componentVersions).filter(k=>before.componentVersions[k]!==after.componentVersions[k]);ctx.assert('Exactly one intended artifact advances',difference,[changed]);const names={'local-core':'core','desktop-ui':'ui','colab-skill':'skill'};for(const [component,name] of Object.entries(names))if(component!==changed)ctx.assert(component+' activation stays unchanged',afterLinks[name],beforeLinks[name]);
}
