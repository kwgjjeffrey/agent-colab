export const USECASE = {
  "name": "Retry failed file synchronization",
  "description": "Purpose: Failures must be recoverable from the visible control.\n\nPreconditions: A disposable share has a simulated temporary upload failure.\n\nActions: Observe the failure, restore connectivity and use Retry.\n\nExpected results: Progress reflects real work, then the share becomes consumable without duplicate registrations."
};

export const META = {
  "id": "context.files.recovery.retry",
  "module": "context/files/recovery",
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
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
