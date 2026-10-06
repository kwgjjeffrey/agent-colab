export const USECASE = {
  "name": "Remove a member and revoke subsequent access",
  "description": "Purpose: Revocation must take effect beyond a removed row in the GUI.\n\nPreconditions: An owner and a second test member share a disposable Channel.\n\nActions: Remove the member through colab-browser, then attempt new reads as the removed member.\n\nExpected results: Membership disappears and future protected reads fail; other members retain access."
};

export const META = {
  "id": "collaboration.members.remove",
  "module": "channels/members",
  "surface": "skill",
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
    "skills/colab/bin/colab-browser"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
