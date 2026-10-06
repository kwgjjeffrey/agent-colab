export const USECASE = {
  "name": "Converge concurrent Canvas edits from two clients",
  "description": "Purpose: Shared editing needs convergence beyond a single successful save.\n\nPreconditions: Two authorized clients open the same disposable Canvas.\n\nActions: Make non-conflicting edits from each client and reconnect both.\n\nExpected results: Both edits persist and both clients converge to the same projection without repeated insertion."
};

export const META = {
  "id": "canvas.realtime.convergence",
  "module": "canvas/sync",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/canvas",
    "skills/colab/bin/colab-canvas"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
