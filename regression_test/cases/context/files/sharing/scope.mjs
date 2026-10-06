export const USECASE = {
  "name": "Apply an explicit Files synchronization scope",
  "description": "Purpose: A contributor must control exactly which local context leaves their device.\n\nPreconditions: A fixture directory contains allowed, excluded and large files.\n\nActions: Inspect the proposed scope, exclude selected paths, confirm sharing and inspect consumer bytes.\n\nExpected results: Only the confirmed scope is published; counts and size reflect it and excluded content is absent."
};

export const META = {
  "id": "context.files.sharing.scope",
  "module": "context/files/sharing",
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
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
