export const USECASE = {
  "name": "Invite a collaborator into the correct Channel",
  "description": "Purpose: Collaboration requires a real, correctly scoped membership grant.\n\nPreconditions: An owner, an existing Organization member and a disposable Channel exist.\n\nActions: Search the member picker, add the member and inspect access from their session.\n\nExpected results: The selected person joins only the intended Channel and can discover its context."
};

export const META = {
  "id": "collaboration.members.invite",
  "module": "channels/members",
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
    "desktop/ui/src/main.tsx",
    "skills/colab/bin/colab-browser"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
