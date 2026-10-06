export const USECASE = {
  "name": "Inspect actual Agent work and failures",
  "description": "Purpose: Human supervision needs faithful work evidence.\n\nPreconditions: A controlled test command produces progress, output and a failure.\n\nActions: Open the work drawer and inspect its state and transcript.\n\nExpected results: Accepted execution, progress and error are distinguishable; complete tool logs are not broadcast as ordinary messages."
};

export const META = {
  "id": "agents.feedback.work-details",
  "module": "agents/feedback",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ]
};
