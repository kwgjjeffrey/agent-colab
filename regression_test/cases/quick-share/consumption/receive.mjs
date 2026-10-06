export const USECASE = {
  "name": "Receive context without joining the sender's Organization",
  "description": "Purpose: Quick Share must deliver context without establishing collaboration membership.\n\nPreconditions: A valid test capability and a receiver outside the sender's Organization exist.\n\nActions: Run colab-transfer receive and inspect each supplied object type.\n\nExpected results: Files materialize read-only, Session is readable through its handle and Skill is usable through the existing adapter; no login or membership is forced."
};

export const META = {
  "id": "quick-share.consumption.receive",
  "module": "quick-share/consumption",
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
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ]
};
