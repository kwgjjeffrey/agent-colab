export const USECASE = {
  "name": "Inspect and disconnect an owned device",
  "description": "Purpose: Device management must affect real authorization.\n\nPreconditions: A disposable second device session belongs to the test account.\n\nActions: Open account Devices, disconnect that session, then retry protected work from it.\n\nExpected results: The selected device loses authorization; the current device remains usable and the GUI reports the actual outcome."
};

export const META = {
  "id": "identity.devices.disconnect",
  "module": "identity/devices",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "local/src",
    "server/standalone/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};
