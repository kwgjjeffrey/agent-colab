export const USECASE = {
  "name": "Reject escaping paths during materialization",
  "description": "Purpose: Downloaded trees must not turn context sharing into filesystem escape.\n\nPreconditions: A controlled malformed object manifest includes traversal and escaping symlink paths.\n\nActions: Attempt materialization in an isolated consumer cache.\n\nExpected results: The operation rejects the unsafe object and cannot write or read outside its managed root.\n\nExecution boundary: verify this contract with controlled inputs through its owning API or adapter; a full browser journey is unnecessary."
};

export const META = {
  "id": "context.files.reading.safe-paths",
  "module": "context/files/reading",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "fast",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "contract"
};
