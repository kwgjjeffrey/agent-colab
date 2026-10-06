export const USECASE = {
  "name": "Reject a stale or unmatched Canvas patch atomically",
  "description": "Purpose: Concurrency must not silently corrupt agent-authored changes.\n\nPreconditions: A document projection has changed since a test Agent read it.\n\nActions: Apply a patch whose contextual text no longer matches.\n\nExpected results: The operation reports the conflict and leaves the document unchanged rather than applying a partial guessed edit."
};

export const META = {
  "id": "canvas.editing.stale-patch",
  "module": "canvas/editing",
  "surface": "skill",
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
