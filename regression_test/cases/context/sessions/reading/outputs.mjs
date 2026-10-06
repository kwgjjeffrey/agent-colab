export const USECASE = {
  "name": "Control Session execution-detail inclusion and truncation",
  "description": "Purpose: Bounded context should not silently discard the user's intent.\n\nPreconditions: A shared fixture has messages, commands and large tool outputs.\n\nActions: Read with default options, then include outputs with a small per-item limit.\n\nExpected results: User and agent text stay complete; execution details follow the option and truncation is explicitly reported."
};

export const META = {
  "id": "context.sessions.reading.outputs",
  "module": "context/sessions/reading",
  "surface": "skill",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
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
