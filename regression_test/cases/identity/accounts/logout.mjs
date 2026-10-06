export const USECASE = {
  "name": "Sign out and clear authenticated views",
  "description": "Purpose: Leaving a session must end its usable authority and visible account scope.\n\nPreconditions: A disposable signed-in session has cached Channel and context data.\n\nActions: Sign out, reopen authenticated views and attempt a new protected operation.\n\nExpected results: The session is signed out, previous account context is not presented and new protected requests require authorization."
};

export const META = {
  "id": "identity.accounts.logout",
  "module": "identity/accounts",
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
    "desktop/ui/src/main.tsx",
    "local/src",
    "server/standalone/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
