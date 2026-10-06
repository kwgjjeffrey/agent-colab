export const USECASE = {
  "name": "Inspect the assembled Canvas command prompt",
  "description": "Purpose: Canvas prompt context has different boundaries from Messages.\n\nPreconditions: A fixture Canvas has named Heading sections and one Agent mention.\n\nActions: Invoke the Agent from a selected section and inspect the captured prompt and labels.\n\nExpected results: The exact document ref, full mention and containing Heading context are included; read precedes optional patch guidance and no raw CRDT is exposed."
};

export const META = {
  "id": "agents.prompts.canvas-assembly",
  "module": "agents/prompts",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ]
};
