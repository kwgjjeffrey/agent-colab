export const USECASE = {
  "name": "Move Canvas documents within the resource tree",
  "description": "Purpose: Document organization must not accidentally change its identity or bytes.\n\nPreconditions: A disposable Channel has folders and several documents.\n\nActions: Move and reorder a document, then reopen from a second client.\n\nExpected results: Tree order and parent persist without losing document content or permitting invalid cyclic folders."
};

export const META = {
  "id": "canvas.documents.move",
  "module": "canvas/documents",
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
    "desktop/ui/src/features/canvas",
    "skills/colab/bin/colab-canvas"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
