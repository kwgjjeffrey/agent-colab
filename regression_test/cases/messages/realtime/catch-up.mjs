export const USECASE = {
  "name": "Recover missed message invalidations",
  "description": "Purpose: WebSocket health alone must not imply conversation consistency.\n\nPreconditions: Two clients share a test Channel and one loses its realtime connection.\n\nActions: Send messages while disconnected, then reconnect or restore window focus.\n\nExpected results: Cursor reconciliation restores all committed messages once, even if an invalidation was lost."
};

export const META = {
  "id": "communication.realtime.catch-up",
  "module": "messages/realtime",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
  "desktop/ui/src/features/messages",
  "skills/colab/bin/colab-messages",
  "desktop/ui/src/features/workspace"
],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed October 9 IA migration: exact mixed-item GUI actions, real Core/Server readback, captured traces where enabled and owned cleanup verified; run evidence in docs/validation-plan.md.",
  "locks": [
  "read:client.primary",
  "read:channel.shared",
  "write:client.receiver",
  "write:transport.receiver",
  "write:native.focus",
  "write:browser.loopback-auth"
]
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {secondary,control,seed} from "../../../support/controls.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["isolationConfirmed", "realtimeControl", "secondClientBaseUrl"]}};
export async function run(ctx){
const c=resource(ctx,'channel');const receiver=await secondary(ctx);try{await receiver.getByRole('button',{name:c.name,exact:true}).click();await receiver.getByRole('button',{name:'Message',exact:true}).click();await control(ctx,'realtimeControl','disconnect');const sent=[];try{for(let i=0;i<3;i++)sent.push(await seed(ctx,'MISSED_'+i+'_'+ctx.runId));}finally{await control(ctx,'realtimeControl','connect');}await receiver.bringToFront();for(const message of sent){await receiver.locator('#message-'+message.id).waitFor();ctx.assert('Missed message is reconciled exactly once',await receiver.locator('#message-'+message.id).count(),1);}}finally{await receiver.close();}
}
