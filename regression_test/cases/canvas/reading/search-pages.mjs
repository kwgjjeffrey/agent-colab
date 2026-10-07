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
  "status": "rotten",
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
  "testLevel": "end-to-end",
  "statusReason": "Review found assertion coverage gap: script checks text presence only, without bounded range, cursor or document identity assertions. Strengthen before reactivation."
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../support/client.mjs";
export async function run(ctx) {
const ref=parameter(ctx,'canvasRef');const listing=data(await cli(ctx,'colab-canvas',['list','--channel',resource(ctx,'channel').id]));ctx.assert('Channel Canvas discovery succeeds',listing!==null,true);const read=data(await cli(ctx,'colab-canvas',['read','--ref',ref,'--offset','1','--limit','10']));const full=data(await cli(ctx,'colab-canvas',['read','--ref',ref,'--offset','1','--limit','1000']));const lines=full.content.match(/[^\n]*\n|[^\n]+$/g)||[];ctx.assert('Read returns exactly the requested line range',read.content,lines.slice(0,10).join(''));if(Object.hasOwn(read,'nextOffset'))ctx.assert('Read cursor reflects remaining lines',read.nextOffset,lines.length>10?11:null);else ctx.assert('Legacy read identifies its starting offset',read.offset,1);ctx.assert('Canvas projection contains fixture text',JSON.stringify(read).includes(parameter(ctx,'canvasExpectedText')),true);const matches=data(await cli(ctx,'colab-canvas',['search','--ref',ref,'--query',parameter(ctx,'canvasSearchTerm'),'--limit','5']));ctx.assert('Search finds the known term',JSON.stringify(matches).includes(parameter(ctx,'canvasSearchTerm')),true);const hits=matches.matches??matches;ctx.assert('Search results have correct source line positions',Array.isArray(hits)&&hits.every(h=>lines[h.line-1]?.trimEnd()===h.text),true);
}

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["canvasExpectedText", "canvasRef", "canvasSearchTerm"]}};
