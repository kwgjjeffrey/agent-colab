export const USECASE = {
  "name": "Resolve ambiguous human-readable resource references",
  "description": "Purpose: Name-based discovery must remain safe for agent decisions.\n\nPreconditions: Two resources have the same readable name in an accessible scope.\n\nActions: Open the ambiguous reference, then use an explicit returned candidate reference.\n\nExpected results: The CLI returns candidates instead of choosing silently; the explicit reference resolves one object."
};

export const META = {
  "id": "collaboration.discovery.ambiguous-reference",
  "module": "collaboration/discovery",
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
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser"
  ]
};
