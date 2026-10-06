export const USECASE = {
  "name": "Inspect the exact assembled message command prompt",
  "description": "Purpose: Prompt assembly is a correctness boundary requiring explicit engineering review.\n\nPreconditions: A fixture blueprint, rich mention, reply chain and context refs are known.\n\nActions: Submit one controlled request and inspect its captured assembled prompt and labels.\n\nExpected results: The full user query, requester, blueprint instruction, bounded reply context and tool guidance are present in the intended order; unrelated context and secrets are absent."
};

export const META = {
  "id": "agents.prompts.message-assembly",
  "module": "agents/prompts",
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
