export const USECASE = {
  "name": "Switch accounts without leaking previous context",
  "description": "Purpose: Account isolation is a trust boundary, not just a navigation action.\n\nPreconditions: Two test accounts have disjoint Channels and cached resources.\n\nActions: Switch from account A to B, inspect navigation, then return to A.\n\nExpected results: Only the selected account's Channels, members and cached context are presented; late A responses cannot populate B.\n\nAdditional checks: Only the active account can update its timeline and activity indicators."
};

export const META = {
  "id": "identity.accounts.switch",
  "module": "identity/accounts",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core",
    "isolated-test-accounts"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "local/src",
    "server/standalone/src",
    "desktop/ui/src/features/messages",
    "skills/colab/bin/colab-messages"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
