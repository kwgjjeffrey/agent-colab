export const USECASE = {
  "name": "Delete only the selected disposable Canvas",
  "description": "Purpose: Destructive document actions need precise scope and honest failure handling.\n\nPreconditions: A disposable Channel contains a target document and a control document.\n\nActions: Delete the target using the real removal flow, then attempt to reopen it.\n\nExpected results: Only the selected document is removed, other content remains and stale references report the actual unavailable state."
};

export const META = {
  "id": "canvas.documents.delete",
  "module": "canvas/documents",
  "surface": "gui",
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
