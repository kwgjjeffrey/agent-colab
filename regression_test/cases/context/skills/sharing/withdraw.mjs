export const USECASE = {
  "name": "Withdraw a shared Skill without removing unrelated installations",
  "description": "Purpose: Publication revocation is distinct from remote removal of downloaded capabilities.\n\nPreconditions: An owned Skill share and a receiver's existing managed installation exist.\n\nActions: Withdraw the shared source and attempt a fresh install or update as the receiver.\n\nExpected results: New source fetches are denied; existing local installations and other shared Skills are not silently erased."
};

export const META = {
  "id": "context.skills.sharing.withdraw",
  "module": "context/skills/sharing",
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
