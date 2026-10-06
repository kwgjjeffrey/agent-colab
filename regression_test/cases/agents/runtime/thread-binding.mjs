export const USECASE = {
  "name": "Reuse threads within a Channel and isolate other Channels",
  "description": "Purpose: Persistent Agent memory must follow the intended collaboration boundary.\n\nPreconditions: One test Agent participates in two disposable Channels.\n\nActions: Issue two related commands in A and an independent command in B.\n\nExpected results: A resumes its existing provider thread; B uses a different thread and does not inherit A conversation history."
};

export const META = {
  "id": "agents.delivery.thread-binding",
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
