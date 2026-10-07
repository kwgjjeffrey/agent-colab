export const USECASE = {
  "name": "Resolve ambiguous human-readable resource references",
  "description": "Purpose: Name-based discovery must remain safe for agent decisions.\n\nPreconditions: Two resources have the same readable name in an accessible scope.\n\nActions: Open the ambiguous reference, then use an explicit returned candidate reference.\n\nExpected results: The CLI returns candidates instead of choosing silently; the explicit reference resolves one object."
};

export const META = {
  "id": "collaboration.discovery.ambiguous-reference",
  "module": "context/discovery",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "trial",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../support/client.mjs";
export async function run(ctx) {
const ref=parameter(ctx,'ambiguousRef');const result=await cli(ctx,'colab-browser',['open','--ref',ref],{expectedCode:2});ctx.assert('Ambiguity is reported',result.error?.code??result.code,'ambiguous_reference');const candidates=result.error?.details?.candidates??result.details?.candidates;ctx.assert('Multiple explicit candidates are provided',Array.isArray(candidates)&&candidates.length>1,true);const resolved=await cli(ctx,'colab-browser',['open','--ref',candidates[0].preciseRef]);ctx.assert('Explicit candidate resolves',resolved.ok,true);
}

export const REQUIREMENTS={"parameters": {"keys": ["ambiguousRef"]}};
