export const USECASE = {
  "name": "Restart Local Core and recover GUI readiness",
  "description": "Purpose: Operational recovery is a real user-facing capability.\n\nPreconditions: A disposable installation has an active GUI session.\n\nActions: Invoke restart and wait for readiness while observing connection state.\n\nExpected results: The GUI reports actual restart progress and recovers without pretending readiness early."
};

export const META = {
  "id": "platform.recovery.core-restart",
  "module": "platform/recovery",
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
