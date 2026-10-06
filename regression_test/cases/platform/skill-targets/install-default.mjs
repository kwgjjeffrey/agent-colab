export const USECASE = {
  "name": "Manage Skill targets and the default Agent",
  "description": "Purpose: GUI Agent actions depend on actual local installation state.\n\nPreconditions: Disposable Agent target roots are discoverable.\n\nActions: Install on one target, set default, then uninstall the selected managed target.\n\nExpected results: Target status and default selection reflect real receipts; other targets are unchanged and unmanaged content is preserved."
};

export const META = {
  "id": "platform.skill-targets.install-default",
  "module": "platform/skill-targets",
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
    "skills/colab/setup",
    "desktop/ui/src/features/updates"
  ]
};
