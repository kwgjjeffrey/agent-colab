export const USECASE = {
  "name": "Distinguish runtime availability from blueprint identity",
  "description": "Purpose: An Agent configuration is not an executing process.\n\nPreconditions: An owned runtime can be deliberately disconnected.\n\nActions: Inspect its Agent card before and after disconnecting.\n\nExpected results: The blueprint remains identifiable while runtime availability changes; unavailable work is not labeled running."
};

export const META = {
  "id": "agents.runtime.availability",
  "module": "agents/runtime",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ]
};
