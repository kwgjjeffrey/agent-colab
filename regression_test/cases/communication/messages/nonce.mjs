export const USECASE = {
  "name": "Deduplicate a retried message submission",
  "description": "Purpose: Transport retries must not duplicate communication or remote work.\n\nPreconditions: A disposable Channel and a controlled retry client exist.\n\nActions: Submit the same message nonce twice while simulating an uncertain first response.\n\nExpected results: Only one persisted message and one set of routed Agent requests exist."
};

export const META = {
  "id": "communication.messages.nonce",
  "module": "communication/messages",
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
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ]
};
