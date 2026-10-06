export const USECASE = {
  "name": "Create and update a Channel through the Skill",
  "description": "Purpose: Agent and human entry points must share business semantics.\n\nPreconditions: A disposable Organization and valid Skill installation are available.\n\nActions: Create a Channel, then update its name and icon using colab-browser.\n\nExpected results: GUI and CLI observe the same authoritative Channel; failed updates preserve the previous values."
};

export const META = {
  "id": "collaboration.channels.create-command",
  "module": "channels/lifecycle",
  "surface": "skill",
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
  "testLevel": "end-to-end"
};
