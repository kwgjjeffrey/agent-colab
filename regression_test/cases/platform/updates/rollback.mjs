export const USECASE = {
  "name": "Reject invalid artifacts and recover a failed activation",
  "description": "Purpose: Updater failure must not strand the collaboration installation.\n\nPreconditions: A sandbox updater has a tampered artifact and a candidate with failed health.\n\nActions: Attempt each update and inspect installation state.\n\nExpected results: Digest or signature failures prevent activation; failed health restores the prior usable combination and reports failure."
};

export const META = {
  "id": "platform.updates.rollback",
  "module": "platform/updates",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "skills/colab/setup",
    "desktop/ui/src/features/updates"
  ]
};
