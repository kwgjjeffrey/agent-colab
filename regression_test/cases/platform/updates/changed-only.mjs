export const USECASE = {
  "name": "Update only changed client artifacts",
  "description": "Purpose: Independent release units must remain independent during update.\n\nPreconditions: A sandbox install has a controlled release with one changed component.\n\nActions: Apply the update and inspect active versions, receipts and health.\n\nExpected results: Only changed artifacts are replaced; unchanged Shell and other versions remain unchanged; readiness succeeds."
};

export const META = {
  "id": "platform.updates.changed-only",
  "module": "platform/updates",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [
    "local-core",
    "sandbox-installation"
  ],
  "affectedPaths": [
    "skills/colab/setup",
    "desktop/ui/src/features/updates"
  ],
  "suite": "release",
  "testLevel": "end-to-end"
};
