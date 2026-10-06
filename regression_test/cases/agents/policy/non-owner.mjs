export const USECASE = {
  "name": "Enforce Ask me first and Refuse policies",
  "description": "Purpose: Remote execution authority must match the actual product policy.\n\nPreconditions: Owner and non-owner test members and controllable Agent policies exist.\n\nActions: Have the non-owner mention the Agent under each restrictive policy.\n\nExpected results: Both requests terminate rejected; Ask me first explains owner re-issue, Refuse does not execute; no fictitious approval queue appears."
};

export const META = {
  "id": "agents.policy.non-owner",
  "module": "agents/policy",
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
