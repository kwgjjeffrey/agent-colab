// Copy into cases/<business/module>/<scenario>.mjs and replace every example value.
// This underscore-prefixed template is not discovered. Omit run until a real script exists.
export const USECASE = {
  name: 'Read a shared document',
  description: `Purpose: verify that an authorized collaborator receives the intended content.
Preconditions: a disposable document and an authorized test account exist.
Actions: open the document through the supported user or command entry.
Expected results: the returned content matches the fixture and identifies its source.`,
};
export const META = {
  id: 'context.documents.read',
  module: 'context/documents/reading', // Business path; parent filters include descendants.
  surface: 'skill', // gui | skill | integration
  priority: 'critical', // critical | normal | extended
  origin: 'requirement', // requirement | bug | acceptance-gap
  status: 'active', // Lifecycle is independent of script implementation.
  effects: 'read-only', // isolated-write requires real disposable fixtures and scoped cleanup.
  cost: 'fast', // Estimate until measured; never invent performance limits.
  covers: [], // Existing operation IDs, when registered; do not invent IDs.
  requires: [], // Match prerequisites explicitly configured in registry.yaml.
  affectedPaths: [], // Actual capability-owned repository-relative source paths.
};
