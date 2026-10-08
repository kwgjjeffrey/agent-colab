export const USECASE = {
  "name": "Give a Session to Agent through its Reader",
  "description": "Purpose: Different resource types require their actual consumption interface.\n\nPreconditions: A shared Session and installed target Agent exist.\n\nActions: Open its Give to Agent dialog and inspect the generated instruction.\n\nExpected results: The instruction directly invokes Session Reader with the correct reference and bounded reading guidance, not a Files cache path."
};

export const META = {
  "id": "context.handoff.session",
  "module": "context/sessions/handoff",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:session.fixture"
  ],
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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source 09a5d4cae252: Actual Session handoff contains Reader command and exact reference, excludes Files-use command."
};

import {openTab,item,handoff} from "../../../../support/gui.mjs";
import {parameter} from "../../../../support/client.mjs";
export async function run(ctx){await handoff(ctx,'Sessions','sessionName','colab-session-reader','sessionRef');ctx.assert('Session prompt is not a Files cache path',!(await ctx.page.getByRole('dialog').locator('pre').innerText()).includes('colab-browser use'),true);}

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["sessionName", "sessionRef"]}};
