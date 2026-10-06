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
  "testLevel": "end-to-end"
};
