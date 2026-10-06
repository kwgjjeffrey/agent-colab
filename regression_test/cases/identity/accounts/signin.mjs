export const USECASE = {
  "name": "Complete browser sign-in and return to Colab",
  "description": "Purpose: The first usable collaboration session depends on this boundary.\n\nPreconditions: A signed-out test installation and a test identity are available.\n\nActions: Start sign-in, finish the supported browser flow, and return to the GUI.\n\nExpected results: The authenticated identity is shown and usable Channels load; cancellation leaves a clear signed-out state."
};

export const META = {
  "id": "identity.accounts.signin",
  "module": "identity/accounts",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core",
    "sandbox-installation"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "local/src",
    "server/standalone/src"
  ],
  "suite": "release",
  "testLevel": "end-to-end"
};
