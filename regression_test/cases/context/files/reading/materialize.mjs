export const USECASE = {
  "name": "Materialize Files through Browser use",
  "description": "Purpose: This is the main agent consumption contract.\n\nPreconditions: An authorized Files share has nested and Unicode paths.\n\nActions: Call colab-browser use, inspect its returned local path and read selected fixture files.\n\nExpected results: A managed local context tree with matching bytes is returned; the agent needs no storage credentials or extra sync calls."
};

export const META = {
  "id": "context.files.reading.materialize",
  "module": "context/files/reading",
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
    "desktop/ui/src/features",
    "skills/colab/bin"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
