export const USECASE = {
  "name": "Search accessible context without exposing other Channels",
  "description": "Purpose: Search is an agent entry into shared context and a permission boundary.\n\nPreconditions: Known matching content exists in an accessible Channel and an inaccessible one.\n\nActions: Run scoped Browser search and inspect returned references and excerpts.\n\nExpected results: Only authorized scoped matches appear; opening a result reaches the same resource."
};

export const META = {
  "id": "collaboration.discovery.search",
  "module": "collaboration/discovery",
  "surface": "skill",
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
