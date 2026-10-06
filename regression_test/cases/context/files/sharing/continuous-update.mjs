export const USECASE = {
  "name": "Propagate an edited source file to its consumer",
  "description": "Purpose: Channel sharing promises ongoing context, not a one-time copy.\n\nPreconditions: A fixture directory is shared and materialized by another member.\n\nActions: Edit the source, wait for published freshness, then refresh the consumer.\n\nExpected results: The consumer obtains the new committed content and version without altering the producer's Git repository."
};

export const META = {
  "id": "context.files.sharing.continuous-update",
  "module": "context/files/sharing",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "slow",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ]
};
