export const USECASE = {
  "name": "Protect locally modified or unmanaged Skills",
  "description": "Purpose: Capability distribution must not destroy a user's customization.\n\nPreconditions: A target contains an unmanaged same-name Skill, then a modified managed Skill.\n\nActions: Attempt install or update against each conflict.\n\nExpected results: Structured conflicts preserve local content; no silent overwrite occurs."
};

export const META = {
  "id": "context.skills.installing.conflict",
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
