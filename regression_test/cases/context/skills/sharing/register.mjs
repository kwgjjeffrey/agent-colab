export const USECASE = {
  "name": "Share a Skill and expose its current root",
  "description": "Purpose: Reusable capabilities are part of the shared-context loop.\n\nPreconditions: A disposable valid Skill directory and Channel exist.\n\nActions: Share it in the GUI and inspect it from a second member's Skill tools.\n\nExpected results: Both entries identify the same current root and compatibility metadata."
};

export const META = {
  "id": "context.skills.sharing.register",
  "module": "context/skills/sharing",
  "surface": "gui",
  "priority": "normal",
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
