export const USECASE = {
  "name": "Recover missed message invalidations",
  "description": "Purpose: WebSocket health alone must not imply conversation consistency.\n\nPreconditions: Two clients share a test Channel and one loses its realtime connection.\n\nActions: Send messages while disconnected, then reconnect or restore window focus.\n\nExpected results: Cursor reconciliation restores all committed messages once, even if an invalidation was lost."
};

export const META = {
  "id": "communication.realtime.catch-up",
  "module": "messages/realtime",
  "surface": "integration",
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
