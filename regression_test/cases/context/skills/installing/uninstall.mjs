export const USECASE = {
  "name": "Uninstall only a managed Skill target",
  "description": "Purpose: Target selection and ownership must constrain removal.\n\nPreconditions: A shared Skill is installed in two disposable Agent targets.\n\nActions: Uninstall it from one target and inspect both receipts and paths.\n\nExpected results: Only the selected managed installation is removed; other targets remain intact."
};

export const META = {
  "id": "context.skills.installing.uninstall",
  "module": "context/skills/installing",
  "surface": "skill",
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
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
