export const USECASE = {
  "name": "Withdraw an owned Files share",
  "description": "Purpose: The product must honestly enforce the contributor's control.\n\nPreconditions: A test Files share is visible to two members.\n\nActions: Withdraw it in the GUI and attempt a new read as the other member.\n\nExpected results: The share leaves active discovery and new fetches are denied; already downloaded copies are not claimed to be erased."
};

export const META = {
  "id": "context.files.sharing.withdraw",
  "module": "context/files/sharing",
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
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
