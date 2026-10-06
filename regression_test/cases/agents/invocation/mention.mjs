export const USECASE = {
  "name": "Route a mention to the intended Agent",
  "description": "Purpose: A mention must route by identity rather than a display-name guess.\n\nPreconditions: A disposable Channel contains an authorized test Agent participant.\n\nActions: Send a message with one stable Agent mention and inspect request state and reply.\n\nExpected results: Exactly that blueprint receives one command; visible mention text and stored rich identity remain intact."
};

export const META = {
  "id": "agents.invocation.mention",
  "module": "agents/invocation",
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
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ]
};
