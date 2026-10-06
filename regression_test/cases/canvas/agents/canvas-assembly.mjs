export const USECASE = {
  "name": "Inspect the assembled Canvas command prompt",
  "description": "Purpose: Canvas prompt context has different boundaries from Messages.\n\nPreconditions: A fixture Canvas has named Heading sections and one Agent mention.\n\nActions: Insert the real GUI Agent mention in one of two Heading sections, then invoke the Agent from that section and inspect the captured prompt and labels.\n\nExpected results: The exact document ref, full mention and containing Heading context are included; read precedes optional patch guidance and no raw CRDT is exposed.\n\nAdditional checks: The full visible mention and that containing section are submitted; the other section is not substituted."
};

export const META = {
  "id": "agents.prompts.canvas-assembly",
  "module": "canvas/agents",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [
    "local-core",
    "test-agent-runtime"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src",
    "desktop/ui/src/features/canvas",
    "skills/colab/bin/colab-canvas"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
