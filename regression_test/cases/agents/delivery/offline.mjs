export const USECASE = {
  "name": "Recover an authorized command after runtime reconnect",
  "description": "Purpose: Offline delivery and real execution have different meanings.\n\nPreconditions: A disposable Agent runtime is offline and the owner is authorized.\n\nActions: Submit a command, inspect its state, reconnect the runtime and observe completion.\n\nExpected results: Offline explanation is visible; command is retained and delivered without duplicate execution; delivering does not masquerade as running."
};

export const META = {
  "id": "agents.delivery.offline",
  "module": "agents/delivery",
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
