export const USECASE = {
  "name": "Browse and preview shared files",
  "description": "Purpose: Human inspection needs a faithful counterpart to agent reads.\n\nPreconditions: A share contains text, a supported preview type and an unsupported file.\n\nActions: Browse its tree and select each fixture.\n\nExpected results: Supported content displays correctly; unsupported content has an honest fallback; loading failures remain visible."
};

export const META = {
  "id": "context.files.reading.preview",
  "module": "context/files/reading",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
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
export async function run(ctx){const row=await item(ctx,'Files','filesName');await row.locator('[data-trace-target~="files.browse"]').click();await ctx.page.getByText(parameter(ctx,'previewFileName'),{exact:true}).click();ctx.assert('Preview renders actual expected content',await ctx.page.getByText(parameter(ctx,'previewExpectedText'),{exact:false}).isVisible(),true);await ctx.screenshot('File preview');}

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["previewExpectedText", "previewFileName"]}};
