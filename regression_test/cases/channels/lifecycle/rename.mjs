export const USECASE = {
  "name": "Rename a Channel without losing its resources",
  "description": "Purpose: Human-readable names must not replace stable resource identity.\n\nPreconditions: A disposable populated Channel exists and the actor can edit it.\n\nActions: Change its name and icon, then reopen existing resource references.\n\nExpected results: The rail and header update; stable references still reach the original resources."
};

export const META = {
  "id": "collaboration.channels.rename",
  "module": "channels/lifecycle",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 00bdef68bcbb: Actual GUI rename preserves Channel UUID; finally restores original name.",
  "locks": [
    "read:client.primary",
    "write:channel.shared"
  ]
};

import {openTab} from "../../../support/gui.mjs";
import {parameter,resource,core,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";
export const REQUIREMENTS={"channel": {"permission": "read"}};
export async function run(ctx){disposable(ctx);const original=resource(ctx,'channel').name;try{await openTab(ctx,'Settings');const name='Renamed '+ctx.runId;const form=ctx.page.locator('[data-trace-target~="channels.update"]');await form.locator('input[name=name]').fill(name);await form.getByRole('button',{name:'Save changes',exact:true}).click();const rows=await eventually(ctx,'Channel name persists',()=>core(ctx,'GET','/v1/channels'),rows=>rows.some(r=>r.id===resource(ctx,'channel').id&&r.name===name));ctx.assert('Stable Channel identity survives rename',rows.find(r=>r.name===name).id,resource(ctx,'channel').id);}finally{await core(ctx,'PATCH','/v1/channels/'+resource(ctx,'channel').id,{name:original});}}
