export const USECASE = {
  "name": "Ignore realtime data from a previous account",
  "description": "Purpose: Async realtime is a common route for stale account leakage.\n\nPreconditions: Two disjoint test accounts are available with an active connection.\n\nActions: Switch accounts while the old socket or an old pull response is still pending.\n\nExpected results: Only the active account can update its timeline and activity indicators."
};

export const META = {
  "id": "communication.realtime.account-switch",
  "module": "communication/realtime",
  "surface": "gui",
  "priority": "critical",
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
