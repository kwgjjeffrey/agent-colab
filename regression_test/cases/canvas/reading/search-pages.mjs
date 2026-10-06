export const USECASE = {
  "name": "Discover and read a bounded Canvas projection",
  "description": "Purpose: Agents should progressively load Canvas context.\n\nPreconditions: A Channel has several documents including a long fixture.\n\nActions: List documents, read bounded ranges and search for a known term.\n\nExpected results: Results identify the intended document and exact readable ranges without dumping unrelated documents."
};

export const META = {
  "id": "canvas.reading.search-pages",
  "module": "canvas/reading",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
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
