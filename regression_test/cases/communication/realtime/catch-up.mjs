export const USECASE = {
  "name": "Recover missed message invalidations",
  "description": "Purpose: WebSocket health alone must not imply conversation consistency.\n\nPreconditions: Two clients share a test Channel and one loses its realtime connection.\n\nActions: Send messages while disconnected, then reconnect or restore window focus.\n\nExpected results: Cursor reconciliation restores all committed messages once, even if an invalidation was lost."
};

export const META = {
  "id": "communication.realtime.catch-up",
  "module": "communication/realtime",
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
