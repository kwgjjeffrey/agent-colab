export const USECASE = {
  "name": "Share a complete agent Session",
  "description": "Purpose: The reasoning history is a first-class collaboration resource.\n\nPreconditions: A fixture Session exists in a supported provider format.\n\nActions: Discover the source, share it to a disposable Channel and list it as another member.\n\nExpected results: The source Session becomes a Shared Item with correct contributor and provider metadata; GUI does not replace it with a summary."
};

export const META = {
  "id": "context.sessions.sharing.register",
  "module": "context/sessions/sharing",
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
  ]
};
