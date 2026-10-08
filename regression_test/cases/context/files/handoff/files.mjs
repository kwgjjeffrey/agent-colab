export const USECASE = {
  "name": "Give Files context to the selected Agent",
  "description": "Purpose: Human-selected context must reach an agent without ambiguity.\n\nPreconditions: A Files share and an installed target Agent are available.\n\nActions: Open Give to Agent, inspect and copy the prompt, then choose the target.\n\nExpected results: The prompt contains the exact resource reference and one usable Browser use command for that target; copying is real and launching does not claim automatic pasting."
};

export const META = {
  "id": "context.handoff.files",
  "module": "context/files/handoff",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:files.fixture"
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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source e84dcb41f5a8: Actual Files row opens handoff containing the correct tool and exact resource reference; no business mutation."
};

import {openTab,item,handoff} from "../../../../support/gui.mjs";
import {parameter} from "../../../../support/client.mjs";
export async function run(ctx){await handoff(ctx,'Files','filesName','colab-browser','filesRef');}

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["filesName", "filesRef"]}};
