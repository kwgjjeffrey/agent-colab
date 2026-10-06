export const USECASE = {
  "name": "Give Files context to the selected Agent",
  "description": "Purpose: Human-selected context must reach an agent without ambiguity.\n\nPreconditions: A Files share and an installed target Agent are available.\n\nActions: Open Give to Agent, inspect and copy the prompt, then choose the target.\n\nExpected results: The prompt contains the exact resource reference and one usable Browser use command for that target; copying is real and launching does not claim automatic pasting."
};

export const META = {
  "id": "context.handoff.files",
  "module": "context/files/handoff",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
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
