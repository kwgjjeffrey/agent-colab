export const USECASE = {
  "name": "Browse real recent activity and open its resource",
  "description": "Purpose: Home should orient a user without manufacturing activity or loading all content.\n\nPreconditions: A Channel has shared context, successful reads and Canvas or Agent activity.\n\nActions: Open Home, page recent activity and follow an entry.\n\nExpected results: Entries reflect real metadata, pagination has no duplicates, and links open the intended resource without prefetching full context."
};

export const META = {
  "id": "collaboration.home.activity",
  "module": "channels/home",
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
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import {openTab,item,handoff} from "../../../support/gui.mjs";
import {parameter} from "../../../support/client.mjs";
export async function run(ctx){await openTab(ctx,'Home');await ctx.page.getByText('Recent activity',{exact:true}).waitFor();const label=parameter(ctx,'expectedActivityLabel');ctx.assert('Expected real activity is displayed',await ctx.page.getByText(label,{exact:false}).isVisible(),true);await ctx.page.getByText(label,{exact:false}).click();ctx.assert('Activity opens the expected destination',await ctx.page.getByRole('tab',{name:parameter(ctx,'activityDestinationTab'),exact:true}).getAttribute('aria-selected'),'true');}

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["activityDestinationTab", "expectedActivityLabel"]}};
