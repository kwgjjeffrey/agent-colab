export const USECASE = {
  "name": "Rename a Channel without losing its resources",
  "description": "Purpose: Human-readable names must not replace stable resource identity.\n\nPreconditions: A disposable populated Channel exists and the actor can edit it.\n\nActions: Change its name and icon, then reopen existing resource references.\n\nExpected results: The rail and header update; stable references still reach the original resources."
};

export const META = {
  "id": "collaboration.channels.rename",
  "module": "channels/lifecycle",
  "surface": "gui",
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
