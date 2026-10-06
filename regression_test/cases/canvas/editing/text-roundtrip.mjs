export const USECASE = {
  "name": "Persist supported Canvas text structures",
  "description": "Purpose: GUI and Agent must observe the same document meaning.\n\nPreconditions: A disposable Canvas fixture exists.\n\nActions: Write headings, paragraphs, lists, code and hard line breaks, reload and read its Markdown projection.\n\nExpected results: GUI and projection preserve the supported structure and content, including line-break behavior."
};

export const META = {
  "id": "canvas.editing.text-roundtrip",
  "module": "canvas/editing",
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
