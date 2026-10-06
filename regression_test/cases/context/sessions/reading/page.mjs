export const USECASE = {
  "name": "Page through a revision-pinned Session",
  "description": "Purpose: Agent context loading must remain coherent while the producer continues working.\n\nPreconditions: A supported multi-page shared Session is available and can grow.\n\nActions: Read recent turns, append source turns, then traverse earlier pages with the original cursor.\n\nExpected results: Pages stay pinned to the original revision with no repeated or missing turns."
};

export const META = {
  "id": "context.sessions.reading.page",
  "module": "context/sessions/reading",
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
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
