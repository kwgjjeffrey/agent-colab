export const USECASE = {
  "name": "Share a local directory and expose it to another member",
  "description": "Purpose: Files are a core producer-to-consumer path.\n\nPreconditions: An isolated fixture directory, two test members and a disposable Channel exist.\n\nActions: Share the directory in GUI; have the second member discover and materialize it.\n\nExpected results: Tree and file bytes match the selected source; registration and background sync states are distinguished."
};

export const META = {
  "id": "context.files.sharing.register",
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
  ]
};
