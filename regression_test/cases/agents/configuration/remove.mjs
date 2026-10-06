export const USECASE = {
  "name": "Remove a blueprint from a Channel or delete it",
  "description": "Purpose: Configuration removal must preserve historical meaning and ownership scope.\n\nPreconditions: A disposable owned blueprint belongs to two test Channels.\n\nActions: Remove it from one Channel, then delete the blueprint through its owner controls.\n\nExpected results: Channel removal affects only that participation; deletion removes the owned blueprint and prevents future routing without rewriting old message history."
};

export const META = {
  "id": "agents.configuration.remove",
  "module": "agents/configuration",
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
