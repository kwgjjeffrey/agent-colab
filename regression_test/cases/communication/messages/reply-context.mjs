export const USECASE = {
  "name": "Reply with a stable context reference",
  "description": "Purpose: Visible conversation context must survive storage and reload.\n\nPreconditions: A disposable Channel contains a message and shared context.\n\nActions: Reply to the message with a context capsule, then reopen the conversation.\n\nExpected results: The reply retains the original message relationship and correct resource identity; display labels do not change authorization."
};

export const META = {
  "id": "communication.messages.reply-context",
  "module": "communication/messages",
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
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ]
};
