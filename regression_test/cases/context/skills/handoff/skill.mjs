export const USECASE = {
  "name": "Generate an idempotent Skill handoff",
  "description": "Purpose: Handoff should avoid manual installation choreography.\n\nPreconditions: A shared Skill is missing or outdated on a disposable target.\n\nActions: Open Give to Agent and inspect the target-specific instruction.\n\nExpected results: The prompt uses ensure for a missing or stale root and identifies the installed Skill when current."
};

export const META = {
  "id": "context.handoff.skill",
  "module": "context/skills/handoff",
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
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
