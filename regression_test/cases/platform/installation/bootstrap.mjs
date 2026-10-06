export const USECASE = {
  "name": "Install from a clean supported macOS environment",
  "description": "Purpose: A publicly distributed tool needs a working first-use path.\n\nPreconditions: An isolated supported macOS test installation has no Colab artifacts.\n\nActions: Run the official bootstrap and inspect installed artifacts, receipts and readiness.\n\nExpected results: Verified compatible Core, GUI and Skill install; the optional Shell is not required and the first real operation succeeds."
};

export const META = {
  "id": "platform.installation.bootstrap",
  "module": "platform/installation",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [],
  "affectedPaths": [
    "skills/colab/setup",
    "desktop/ui/src/features/updates"
  ]
};
