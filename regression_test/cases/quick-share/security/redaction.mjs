export const USECASE = {
  "name": "Keep capability secrets out of diagnostics",
  "description": "Purpose: Bearer capabilities must not leak through observability.\n\nPreconditions: A controlled capability can produce success and error output.\n\nActions: Exercise receive and malformed-token errors; inspect logs and trace attributes.\n\nExpected results: Tokens are absent from general logs and errors; only safe fingerprints appear; the intentional handoff prompt is handled as secret-bearing content."
};

export const META = {
  "id": "quick-share.security.redaction",
  "module": "quick-share/security",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "slow",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ]
};
