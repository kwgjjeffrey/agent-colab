export const USECASE = {
  "name": "Discover valid Skill sources",
  "description": "Purpose: Agents must discover capabilities before installing them.\n\nPreconditions: A fixture Skill root and an invalid directory are present.\n\nActions: Run Skill sources with query and recent-change filters.\n\nExpected results: Valid sources have accurate names, descriptions and target metadata; invalid directories are not installable sources."
};

export const META = {
  "id": "context.skills.discovery.sources",
  "module": "context/skills/discovery",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
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
