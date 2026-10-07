export const USECASE = {
  "name": "Read Channel messages with an incremental cursor",
  "description": "Purpose: Agents need the same conversation context without GUI scraping.\n\nPreconditions: A test Channel has multiple messages and a known cursor.\n\nActions: List and read messages through colab-messages, then request after the cursor.\n\nExpected results: Returned messages have stable identity and order; only later messages appear in the incremental result."
};

export const META = {
  "id": "communication.messages.skill-read",
  "module": "messages/timeline",
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
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../support/client.mjs";
export async function run(ctx) {
const ref=resource(ctx,'channel').id;const firstEnvelope=await cli(ctx,'colab-messages',['messages','list','--channel',ref,'--limit','20']);const result=data(firstEnvelope);const rows=Array.isArray(result)?result:result.messages;ctx.assert('Message list is structured',Array.isArray(rows),true);if(!rows.length)ctx.block('Channel requires fixture messages');const first=rows[0];const detail=data(await cli(ctx,'colab-messages',['messages','read','--channel',ref,'--id',first.id]));ctx.assert('Read returns selected message',detail.id,first.id);const seq=firstEnvelope.page?.nextAfter;ctx.assert('Message has a cursor',Number.isFinite(seq),true);const later=data(await cli(ctx,'colab-messages',['messages','list','--channel',ref,'--after',String(seq)]));ctx.assert('Incremental read excludes previous messages',(Array.isArray(later)?later:later.messages).every(m=>m.id!==first.id),true);
}

export const REQUIREMENTS={"channel": {"permission": "read"}};
