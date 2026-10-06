export const USECASE = {
  "name": "Read Channel messages with an incremental cursor",
  "description": "Purpose: Agents need the same conversation context without GUI scraping.\n\nPreconditions: A test Channel has multiple messages and a known cursor.\n\nActions: List and read messages through colab-messages, then request after the cursor.\n\nExpected results: Returned messages have stable identity and order; only later messages appear in the incremental result."
};

export const META = {
  "id": "communication.messages.skill-read",
  "module": "communication/messages",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ]
};
