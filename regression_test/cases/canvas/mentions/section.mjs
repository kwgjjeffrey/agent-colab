export const USECASE = {
  "name": "Invoke an Agent from the correct Heading section",
  "description": "Purpose: Visible document position determines meaningful prompt context.\n\nPreconditions: A Canvas fixture contains two Heading sections and an authorized Agent.\n\nActions: Insert an Agent mention in one section and invoke it.\n\nExpected results: The full visible mention and that containing section are submitted; the other section is not substituted."
};

export const META = {
  "id": "canvas.mentions.section",
  "module": "canvas/mentions",
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
  ]
};
