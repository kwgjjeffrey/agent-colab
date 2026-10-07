export const USECASE = {
  "name": "Discover and read a bounded Canvas projection",
  "description": "Purpose: Agents should progressively load Canvas context.\n\nPreconditions: A Channel has several documents including a long fixture.\n\nActions: List documents, read bounded ranges and search for a known term.\n\nExpected results: Results identify the intended document and exact readable ranges without dumping unrelated documents."
};

export const META = {
  "id": "canvas.reading.search-pages",
  "module": "canvas/reading",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/canvas",
    "skills/colab/bin/colab-canvas"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../support/client.mjs";
export async function run(ctx) {
const ref=parameter(ctx,'canvasRef');const listing=data(await cli(ctx,'colab-canvas',['list','--channel',channelRef(ctx)]));ctx.assert('Channel Canvas discovery succeeds',listing!==null,true);const read=data(await cli(ctx,'colab-canvas',['read','--ref',ref,'--offset','1','--limit','10']));ctx.assert('Canvas projection contains fixture text',JSON.stringify(read).includes(parameter(ctx,'canvasExpectedText')),true);const matches=data(await cli(ctx,'colab-canvas',['search','--ref',ref,'--query',parameter(ctx,'canvasSearchTerm'),'--limit','5']));ctx.assert('Search finds the known term',JSON.stringify(matches).includes(parameter(ctx,'canvasSearchTerm')),true);
}

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["canvasExpectedText", "canvasRef", "canvasSearchTerm"]}};
