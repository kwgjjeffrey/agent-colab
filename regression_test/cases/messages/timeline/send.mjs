export const USECASE = {
  "name": "Send a message and observe it on another client",
  "description": "Purpose: Messages anchor user-to-agent and member collaboration.\n\nPreconditions: Two test clients are members of a disposable Channel.\n\nActions: Send a unique plain-text message and wait for both timelines.\n\nExpected results: The same committed message appears exactly once on both clients with the correct sender; errors do not appear as success."
};

export const META = {
  "id": "communication.messages.send",
  "module": "messages/timeline",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core",
    "isolated-test-accounts"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
