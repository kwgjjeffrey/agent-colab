export const USECASE = {
  "name": "Browse real recent activity and open its resource",
  "description": "Purpose: Home should orient a user without manufacturing activity or loading all content.\n\nPreconditions: A Channel has shared context, successful reads and Canvas or Agent activity.\n\nActions: Open Home, page recent activity and follow an entry.\n\nExpected results: Entries reflect real metadata, pagination has no duplicates, and links open the intended resource without prefetching full context."
};

export const META = {
  "id": "collaboration.home.activity",
  "module": "collaboration/home",
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
  ]
};
