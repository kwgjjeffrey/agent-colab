export const USECASE = {
  "name": "Create and reopen a Canvas document",
  "description": "Purpose: Canvas provides a durable shared working surface.\n\nPreconditions: A disposable Channel and authorized test member exist.\n\nActions: Create a Canvas, edit its title, navigate away and reopen it.\n\nExpected results: One persistent document with the intended title appears in the resource tree and opens correctly."
};

export const META = {
  "id": "canvas.documents.create-open",
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
  ]
};
