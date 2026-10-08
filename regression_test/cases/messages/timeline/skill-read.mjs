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
  "locks": [
    "read:client.primary",
    "read:channel.shared"
  ],
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 8b826b767a19: Real CLI selected message read and continuation cursor; incremental read excludes prior message."
};

import fs from "node:fs/promises";
import path from "node:path";
import {parameter,resource,channelRef,cli,core,data,disposable,eventually} from "../../../support/client.mjs";
export async function run(ctx) {
const ref=resource(ctx,'channel').id,id=parameter(ctx,'messageReadId'),seq=parameter(ctx,'messageReadSeq');
const detail=data(await cli(ctx,'colab-messages',['messages','read','--channel',ref,'--id',id]));ctx.assert('Read returns the bound fixture identity',detail.id,id);ctx.assert('Read returns exact fixture content',detail.body,parameter(ctx,'messageReadExpectedBody'));
const result=data(await cli(ctx,'colab-messages',['messages','list','--channel',ref,'--after',String(seq),'--limit','100']));const rows=Array.isArray(result)?result:result.messages;ctx.assert('Incremental list excludes prior fixture',rows.every(m=>m.id!==id&&m.seq>seq),true);const later=rows.find(m=>m.id===parameter(ctx,'messageReadLaterId'));ctx.assert('Bound later message is retained',later?.body,parameter(ctx,'messageReadLaterBody'));
}

export const REQUIREMENTS={channel:{permission:"read"},parameters:{keys:["messageReadId","messageReadSeq","messageReadExpectedBody","messageReadLaterId","messageReadLaterBody"]}};
