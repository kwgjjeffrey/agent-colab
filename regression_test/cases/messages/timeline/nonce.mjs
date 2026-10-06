export const USECASE = {
  "name": "Deduplicate a retried message submission",
  "description": "Purpose: Transport retries must not duplicate communication or remote work.\n\nPreconditions: A disposable Channel and a controlled retry client exist.\n\nActions: Submit the same message nonce twice while simulating an uncertain first response.\n\nExpected results: Only one persisted message and one set of routed Agent requests exist.\n\nExecution boundary: verify this contract with controlled inputs through its owning API or adapter; a full browser journey is unnecessary."
};

export const META = {
  "id": "communication.messages.nonce",
  "module": "messages/timeline",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "fast",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "contract"
};
