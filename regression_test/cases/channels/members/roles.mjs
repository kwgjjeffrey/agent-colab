export const USECASE = {
  "name": "Enforce member roles on Channel management",
  "description": "Purpose: Hiding a management control is insufficient authorization.\n\nPreconditions: A disposable Channel contains an owner and a restricted member.\n\nActions: Change the member role and attempt Channel settings and member management from that account.\n\nExpected results: Allowed actions match the persisted role; restricted requests fail at the server as well as the GUI."
};

export const META = {
  "id": "collaboration.members.roles",
  "module": "channels/members",
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
