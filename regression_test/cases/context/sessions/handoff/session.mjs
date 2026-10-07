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
  "status": "trial",
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
  "testLevel": "end-to-end"
};

import {openTab,item,handoff} from "../../../../support/gui.mjs";
import {parameter} from "../../../../support/client.mjs";
export async function run(ctx){await handoff(ctx,'Sessions','sessionName','colab-session-reader','sessionRef');ctx.assert('Session prompt is not a Files cache path',!(await ctx.page.getByRole('dialog').locator('pre').innerText()).includes('colab-browser use'),true);}

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["sessionName", "sessionRef"]}};
