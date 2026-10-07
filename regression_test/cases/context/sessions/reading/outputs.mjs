export const USECASE = {
  "name": "Control Session execution-detail inclusion and truncation",
  "description": "Purpose: Bounded context should not silently discard the user's intent.\n\nPreconditions: A shared fixture has messages, commands and large tool outputs.\n\nActions: Read with default options, then include outputs with a small per-item limit.\n\nExpected results: User and agent text stay complete; execution details follow the option and truncation is explicitly reported."
};

export const META = {
  "id": "context.sessions.reading.outputs",
  "module": "context/sessions/reading",
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
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed real actions, exact observed assertions and resource cleanup in Round 6 (20261007T115742Z-bfdf7648); corrected behavior verified."
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../../support/client.mjs";
export async function run(ctx) {
const ref=parameter(ctx,'sessionRef');const basic=data(await cli(ctx,'colab-session-reader',['read','--ref',ref,'--turn-limit','20']));const detailed=data(await cli(ctx,'colab-session-reader',['read','--ref',ref,'--turn-limit','20','--include-outputs','--max-output-chars-per-item','80']));ctx.assert('Session returns turns',Array.isArray(basic.turns)&&Array.isArray(detailed.turns),true);const basicItems=basic.turns.flatMap(t=>t.items);ctx.assert('Default read omits execution result bodies',basicItems.every(x=>x.result===undefined||x.result===null),true);const items=detailed.turns.flatMap(t=>t.items);ctx.assert('Large output fixture is explicitly truncated',items.some(x=>x.result?.truncated===true),true);const expected=parameter(ctx,'expectedUserMessage');ctx.assert('User intent survives output limits',items.some(x=>(typeof x.content==='string'?x.content:Array.isArray(x.content)?x.content.map(c=>c.text??'').join(''):x.text)===expected),true);
}

export const REQUIREMENTS={"parameters": {"keys": ["expectedUserMessage", "sessionRef"]}};
