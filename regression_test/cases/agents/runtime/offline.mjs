export const USECASE = {
  "name": "Recover an authorized command after runtime reconnect",
  "description": "Purpose: Offline delivery and real execution have different meanings.\n\nPreconditions: A disposable Agent runtime is offline and the owner is authorized.\n\nActions: Submit a command, inspect its state, reconnect the runtime and observe completion.\n\nExpected results: Offline explanation is visible; command is retained and delivered without duplicate execution; delivering does not masquerade as running.\n\nAdditional checks: The blueprint remains identifiable while runtime availability changes; unavailable work is not labeled running."
};

export const META = {
  "id": "agents.delivery.offline",
  "module": "agents/runtime",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core",
    "test-agent-runtime"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
