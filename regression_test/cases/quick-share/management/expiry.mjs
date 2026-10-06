export const USECASE = {
  "name": "Change a managed Quick Share expiry",
  "description": "Purpose: Capability lifetime is a managed permission boundary.\n\nPreconditions: An owned disposable Quick Share and a second unauthorized actor exist.\n\nActions: Update its expiry from management controls, then attempt the same update as the other actor.\n\nExpected results: The owner sees the persisted deadline; unauthorized changes fail and no Channel membership is granted."
};

export const META = {
  "id": "quick-share.management.expiry",
  "module": "quick-share/management",
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
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ]
};
