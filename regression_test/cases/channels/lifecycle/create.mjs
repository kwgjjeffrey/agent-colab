export const USECASE = {
  "name": "Create a Channel and enter it",
  "description": "Purpose: This is the root of the recurring collaboration loop.\n\nPreconditions: A disposable Organization and unique Channel name are available.\n\nActions: Create a Channel using the GUI and inspect its default navigation and member list.\n\nExpected results: Exactly one Channel exists, its creator is a member, and its Messages and context tabs are usable."
};

export const META = {
  "id": "collaboration.channels.create",
  "module": "channels/lifecycle",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "trial",
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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 2237fdc90a21: Actual GUI creates exactly one owned Channel, verifies creator role and usable navigation; uniquely named test Channel retained.",
  "locks": [
    "read:client.primary",
    "read:channel.shared"
  ]
};

import {openTab} from "../../../support/gui.mjs";
import {parameter,resource,core,disposable,eventually} from "../../../support/client.mjs";
import {createDocument,deleteDocument} from "../../../support/canvas.mjs";
export const REQUIREMENTS={"channel": {"permission": "read"}};
export async function run(ctx){const name='Regression GUI '+ctx.runId;await ctx.page.getByRole('button',{name:'Create channel',exact:true}).click();await ctx.page.getByLabel('Channel name',{exact:true}).fill(name);await ctx.page.getByRole('dialog').getByRole('button',{name:'Create',exact:true}).click();await ctx.page.getByRole('button',{name,exact:true}).waitFor();const rows=await core(ctx,'GET','/v1/channels');ctx.assert('GUI creates exactly one named Channel',rows.filter(r=>r.name===name).length,1);ctx.assert('New Channel creator has management role',['admin','owner'].includes(rows.find(r=>r.name===name).role),true);ctx.assert('Messages navigation is usable',await ctx.page.getByRole('button',{name:'Message',exact:true}).isVisible(),true);}
