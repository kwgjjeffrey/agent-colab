export const USECASE = {
  "name": "Ensure a shared Skill idempotently",
  "description": "Purpose: An agent should safely consume the same capability repeatedly.\n\nPreconditions: A test target has no conflicting Skill and a valid shared root exists.\n\nActions: Call ensure twice, then publish a changed source and call ensure again.\n\nExpected results: First call installs, second is a no-op, third updates to the new root with a matching ownership receipt."
};

export const META = {
  "id": "context.skills.installing.ensure",
  "module": "context/skills/installing",
  "surface": "skill",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ]
};
