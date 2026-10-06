export const USECASE = {
  "name": "Reissue an authorized owner command through a reply",
  "description": "Purpose: Owner authorization must create a concrete new instruction.\n\nPreconditions: A non-owner request was rejected by Ask me first.\n\nActions: Owner replies with revised instructions and mentions their Agent.\n\nExpected results: A new request uses the owner's full reply as query and the reply chain as context; the rejected request stays rejected."
};

export const META = {
  "id": "agents.policy.owner-reissue",
  "module": "agents/policy",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core",
    "test-agent-runtime"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
