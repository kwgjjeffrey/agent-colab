export const USECASE = {
  "name": "Deny new consumption after expiry or revocation",
  "description": "Purpose: Capability revocation must enforce the promised boundary.\n\nPreconditions: Disposable capabilities exist for one short-lived and one revocable share.\n\nActions: Let one expire and revoke the other, then attempt new receives.\n\nExpected results: Both new fetches fail clearly; already downloaded copies are not claimed to be remotely erased."
};

export const META = {
  "id": "quick-share.permissions.expired-revoked",
  "module": "quick-share/permissions",
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
  ]
};
