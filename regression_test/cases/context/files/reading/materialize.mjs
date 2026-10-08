export const USECASE = {
  "name": "Materialize Files through Browser use",
  "description": "Purpose: This is the main agent consumption contract.\n\nPreconditions: An authorized Files share has nested and Unicode paths.\n\nActions: Call colab-browser use, inspect its returned local path and read selected fixture files.\n\nExpected results: A managed local context tree with matching bytes is returned; the agent needs no storage credentials or extra sync calls."
};

export const META = {
  "id": "context.files.reading.materialize",
  "module": "context/files/reading",
  "surface": "skill",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source b314b63f0565: Actual Skill materializes registered fixture; path is bounded and bytes equal configured source.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:files.fixture"
  ]
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../../support/client.mjs";
export async function run(ctx) {
const ref=parameter(ctx,'filesRef');const value=data(await cli(ctx,'colab-browser',['use','--ref',ref]));ctx.assert('Materialization returns a local path',typeof value.localPath==='string',true);const rel=parameter(ctx,'expectedRelativePath');const file=path.resolve(value.localPath,rel);ctx.assert('Expected path remains inside materialization',file.startsWith(path.resolve(value.localPath)+path.sep),true);const content=await fs.readFile(file,'utf8');ctx.assert('Materialized bytes match source fixture',content,parameter(ctx,'expectedText'));
}

export const REQUIREMENTS={"parameters": {"keys": ["expectedRelativePath", "expectedText", "filesRef"]}};
