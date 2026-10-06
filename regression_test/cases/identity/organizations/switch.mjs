export const USECASE = {
  "name": "Switch Organization and reset scoped resources",
  "description": "Purpose: Tenant scope must survive both navigation and async replies.\n\nPreconditions: A test identity belongs to two Organizations.\n\nActions: Select the other Organization and open its Channels and member picker.\n\nExpected results: Channel and people discovery use the new Organization; stale selection is cleared."
};

export const META = {
  "id": "identity.organizations.switch",
  "module": "identity/organizations",
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
  ]
};
