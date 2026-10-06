export const USECASE = {
  "name": "Write request-scoped Agent replies safely",
  "description": "Purpose: Agent output must not impersonate people or duplicate feedback.\n\nPreconditions: A test Agent has one request with a known trigger and requester.\n\nActions: Report a reply through the request-scoped tool and retry its nonce.\n\nExpected results: One reply has the fixed blueprint sender, authoritative requester mention and trigger link; arbitrary sender or reply target cannot be chosen."
};

export const META = {
  "id": "agents.feedback.reply",
  "module": "agents/feedback",
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
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ]
};
