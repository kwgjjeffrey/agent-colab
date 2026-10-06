export const USECASE = {
  "name": "Route distinct mentions once per Agent",
  "description": "Purpose: One user action may fan out to multiple independently owned Agents.\n\nPreconditions: Two authorized test Agents participate in a disposable Channel.\n\nActions: Mention each Agent and repeat one mention in the same message.\n\nExpected results: Each distinct blueprint receives one independent request; repeated mentions do not duplicate work."
};

export const META = {
  "id": "agents.invocation.multiple",
  "module": "agents/invocation",
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
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ]
};
