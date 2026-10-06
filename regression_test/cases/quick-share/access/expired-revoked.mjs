export const USECASE = {
  "name": "Deny new consumption after expiry or revocation",
  "description": "Purpose: Capability revocation must enforce the promised boundary.\n\nPreconditions: Disposable capabilities exist for one short-lived and one revocable share.\n\nActions: Let one expire and revoke the other, then attempt new receives.\n\nExpected results: Both new fetches fail clearly; already downloaded copies are not claimed to be remotely erased.\n\nVariations: report each object type or failure condition independently. Reset its isolated fixture between variations; an earlier failure must not suppress later results."
};

export const META = {
  "id": "quick-share.permissions.expired-revoked",
  "module": "quick-share/access",
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
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
