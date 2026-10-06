export const USECASE = {
  "name": "Create a fixed Quick Share snapshot",
  "description": "Purpose: One-time handoff has a different lifetime from Channel sharing.\n\nPreconditions: Disposable Files, Session and Skill fixture sources exist.\n\nActions: Select sources, set expiry and create a Quick Share; then change the sources.\n\nExpected results: The returned share represents the selected snapshot and does not follow later source updates or grant Channel membership."
};

export const META = {
  "id": "quick-share.creation.snapshot",
  "module": "quick-share/sharing",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
