export const USECASE = {
  "name": "Reject access to another Channel's context",
  "description": "Purpose: Discovery filtering alone cannot secure direct resource references.\n\nPreconditions: Two accounts and a private Channel owned by A exist; B has no membership.\n\nActions: As B, open a known A resource URI and attempt Files, Session and Canvas reads.\n\nExpected results: All protected operations deny access with structured errors; no bytes or metadata leak through cached resolution.\n\nVariations: report each object type or failure condition independently. Reset its isolated fixture between variations; an earlier failure must not suppress later results."
};

export const META = {
  "id": "identity.permissions.unauthorized",
  "module": "identity/permissions",
  "surface": "skill",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core",
    "isolated-test-accounts"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "local/src",
    "server/standalone/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
