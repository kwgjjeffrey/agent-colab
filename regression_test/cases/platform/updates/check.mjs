export const USECASE = {
  "name": "Check artifact updates without modifying installation",
  "description": "Purpose: Users need a trustworthy preview before updating.\n\nPreconditions: A test installation and controlled channel manifest exist.\n\nActions: Use Check updates and inspect component versions and update proposal.\n\nExpected results: Each artifact is compared independently; checking does not install and errors are explicit."
};

export const META = {
  "id": "platform.updates.check",
  "module": "platform/updates",
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
    "skills/colab/setup",
    "desktop/ui/src/features/updates"
  ]
};
