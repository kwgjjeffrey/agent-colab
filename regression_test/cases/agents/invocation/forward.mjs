export const USECASE = {
  "name": "Forward selected context into one Agent request",
  "description": "Purpose: Human curation is a distinct entry from direct Agent mention.\n\nPreconditions: A test conversation contains multiple messages and shared resource capsules.\n\nActions: Select a subset, choose an authorized Agent and inspect the final instruction before sending.\n\nExpected results: Only selected context and the explicit task reach the intended Agent; unselected conversation is not substituted."
};

export const META = {
  "id": "agents.invocation.forward",
  "module": "agents/invocation",
  "surface": "gui",
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
