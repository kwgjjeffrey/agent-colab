export const USECASE = {
  "name": "Create a blueprint bound to an owned runtime",
  "description": "Purpose: The executable participant must have a real owner and destination.\n\nPreconditions: An available owned Codex runtime and disposable test configuration exist.\n\nActions: Create a blueprint with instructions, Skills and invocation policy, then add it to a Channel.\n\nExpected results: The selected owned runtime and blueprint are persisted; missing or foreign runtime selection is rejected."
};

export const META = {
  "id": "agents.configuration.blueprint",
  "module": "agents/configuration",
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
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ]
};
