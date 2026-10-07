export const USECASE = {
  "name": "Page through a revision-pinned Session",
  "description": "Purpose: Agent context loading must remain coherent while the producer continues working.\n\nPreconditions: A supported multi-page shared Session is available and can grow.\n\nActions: Read recent turns, append source turns, then traverse earlier pages with the original cursor.\n\nExpected results: Pages stay pinned to the original revision with no repeated or missing turns."
};

export const META = {
  "id": "context.sessions.reading.page",
  "module": "context/sessions/reading",
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
  "statusReason": "Reviewed Round 3 20261007T102452Z-cbabd0e6: actual source growth, cursor non-looping, original turns exactly once, new turn excluded and finally restores source; repeat pass in Rounds 1 and 2."
};

import fs from "node:fs/promises";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../../support/client.mjs";

export async function run(ctx){
disposable(ctx);const ref=parameter(ctx,'sessionRef'),source=parameter(ctx,'sessionSourcePath');
const original=await fs.readFile(source,'utf8');let first=await cli(ctx,'colab-session-reader',['read','--ref',ref,'--turn-limit','1']);ctx.assert('Fixture has multiple pages',!!first.page?.nextCursor,true);
const before=[...data(first).turns];let cursor=first.page.nextCursor;const cursors=new Set();
try{await fs.appendFile(source,JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:[{text:'NEW_TURN_'+ctx.runId}]}})+'\n');
while(cursor){ctx.assert('Cursor does not loop',!cursors.has(cursor),true);cursors.add(cursor);const next=await cli(ctx,'colab-session-reader',['read','--ref',ref,'--turn-limit','1','--cursor',cursor]);before.push(...data(next).turns);cursor=next.page?.nextCursor;if(cursors.size>100)ctx.block('Fixture exceeds supported page count');}
ctx.assert('Pinned pages exclude the newly appended turn',!JSON.stringify(before).includes('NEW_TURN_'+ctx.runId),true);const markers=parameter(ctx,'sessionExpectedTurnMarkers');const combined=JSON.stringify(before);for(const marker of markers)ctx.assert('Original turn appears exactly once: '+marker,combined.split(marker).length-1,1);
}finally{await fs.writeFile(source,original);}
}
export const REQUIREMENTS={"parameters": {"keys": ["sessionExpectedTurnMarkers", "sessionRef", "sessionSourcePath"]}};
