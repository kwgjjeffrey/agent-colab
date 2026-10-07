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
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T111006Z-bdad100c, execution source 9df918d6f62d: Owned receiver realtime interrupted; real committed messages all reconcile exactly once; transport restored and browser context closed."
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {secondary,control,seed} from "../../../support/controls.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["isolationConfirmed", "realtimeControl", "secondClientBaseUrl"]}};
export async function run(ctx){
const c=resource(ctx,'channel');const receiver=await secondary(ctx);try{await receiver.getByRole('button',{name:c.name,exact:true}).click();await receiver.getByRole('tab',{name:'Messages',exact:true}).click();await control(ctx,'realtimeControl','disconnect');const sent=[];try{for(let i=0;i<3;i++)sent.push(await seed(ctx,'MISSED_'+i+'_'+ctx.runId));}finally{await control(ctx,'realtimeControl','connect');}await receiver.bringToFront();for(const message of sent){await receiver.locator('#message-'+message.id).waitFor();ctx.assert('Missed message is reconciled exactly once',await receiver.locator('#message-'+message.id).count(),1);}}finally{await receiver.close();}
}
