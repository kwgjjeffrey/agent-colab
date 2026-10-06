export const USECASE = {
  "name": "Apply a textual Canvas patch through the Skill",
  "description": "Purpose: Agent edits must use the same durable document boundary.\n\nPreconditions: An authorized disposable Canvas and its current projection are available.\n\nActions: Read through colab-canvas, then apply a small contextual patch.\n\nExpected results: Only the intended text changes, the GUI converges, and the agent receives plain Markdown without CRDT internals."
};

export const META = {
  "id": "canvas.editing.agent-patch",
  "module": "canvas/editing",
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
    "desktop/ui/src/features/canvas",
    "skills/colab/bin/colab-canvas"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
