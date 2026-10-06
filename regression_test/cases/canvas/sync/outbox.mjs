export const USECASE = {
  "name": "Recover Canvas edits after offline restart",
  "description": "Purpose: Local durability is essential when the network fails.\n\nPreconditions: A disposable Canvas has been loaded and Local Core can be restarted safely.\n\nActions: Edit while offline, restart Core, then restore the connection.\n\nExpected results: Durable queued changes survive, upload in order and converge; the GUI shows pending versus synced accurately."
};

export const META = {
  "id": "canvas.recovery.outbox",
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
