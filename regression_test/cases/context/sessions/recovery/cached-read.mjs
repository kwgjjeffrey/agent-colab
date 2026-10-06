export const USECASE = {
  "name": "Read cached Session history while offline",
  "description": "Purpose: Network failure must not unnecessarily erase usable working context.\n\nPreconditions: A Session revision is already cached on the consuming device.\n\nActions: Disconnect only the isolated test client transport and read the Session again.\n\nExpected results: Usable cached turns are returned with explicit freshness; unavailable history is not fabricated."
};

export const META = {
  "id": "context.sessions.recovery.cached-read",
  "module": "context/sessions/recovery",
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
