# Agent Colab regression coverage

Reviewed case inventory: 74 case-only scenarios and two existing executable discovery pilots. No new script has been implemented or executed. The deliberate runner failure fixture is retained under diagnostics/, outside registered case directories; historical runs are preserved.

## Module hierarchy

Module paths derive from each case META. GUI/Skill/integration describe entry surface. Context handoff belongs to its resource type. Account isolation belongs to identity; runtime delivery belongs to agents/runtime; Canvas mention prompt correctness belongs to canvas/agents.

- `agents/configuration` — 2 cases
- `agents/feedback` — 2 cases
- `agents/invocation` — 3 cases
- `agents/policy` — 2 cases
- `agents/prompts` — 1 cases
- `agents/runtime` — 2 cases
- `canvas/agents` — 1 cases
- `canvas/documents` — 3 cases
- `canvas/editing` — 3 cases
- `canvas/reading` — 1 cases
- `canvas/sync` — 2 cases
- `channels/home` — 1 cases
- `channels/lifecycle` — 3 cases
- `channels/members` — 3 cases
- `context/discovery` — 1 cases
- `context/files/handoff` — 1 cases
- `context/files/reading` — 3 cases
- `context/files/recovery` — 1 cases
- `context/files/sharing` — 4 cases
- `context/sessions/handoff` — 1 cases
- `context/sessions/reading` — 2 cases
- `context/sessions/recovery` — 1 cases
- `context/sessions/sharing` — 2 cases
- `context/skills/discovery` — 1 cases
- `context/skills/handoff` — 1 cases
- `context/skills/installing` — 3 cases
- `context/skills/sharing` — 2 cases
- `identity/accounts` — 3 cases
- `identity/devices` — 1 cases
- `identity/organizations` — 1 cases
- `identity/permissions` — 1 cases
- `messages/realtime` — 1 cases
- `messages/timeline` — 4 cases
- `platform/installation` — 1 cases
- `platform/recovery` — 1 cases
- `platform/skill-targets` — 1 cases
- `platform/updates` — 3 cases
- `quick-share/access` — 2 cases
- `quick-share/sharing` — 3 cases

## Execution groups

- `suite=business`: 69 executable scenarios including two discovery pilots. Three controlled-input checks use `testLevel=contract`; the rest use end-to-end boundaries.
- `suite=release`: seven executable sign-in, installation, updater, target-install and process-recovery scenarios. Run as independent release acceptance.

Select explicitly with `--meta '{"suite":["business"]}'` or `--meta '{"suite":["release"]}'`; the GUI uses the same metadata fields. An unfiltered full run still means all executable active cases, so always select a suite for routine work. All 76 current cases have runners. Missing resource/control prerequisites block before execution.

Real Agent execution is required for Agent end-to-end cases; no runtime substitute is used. Tests consume the actual registered Codex runtime. Cross-account and fault/recovery variants still require their separately bound resources and controls. Missing prerequisites are blockers, not passing tests. No controlled runtime was introduced by this review.

## Review decisions

Removed the unsupported Browser-search draft; merged three overlapping cases while preserving assertions (account-switch realtime isolation, runtime offline visibility, Canvas section selection and prompt capture). Keep sharing and consumption independently diagnosable; share fixture helpers instead of building dependent lifecycle scripts.

Integrity rejection and activation rollback, Channel removal and blueprint deletion, expiry and revocation, and resource-type variations require independent reported checks and fixture reset. Project cases use isolated resources or sandbox installations; effects metadata never creates isolation. Cost remains an estimate and no latency thresholds are fabricated.

See review.md for the original per-case decision record. Its old IDs identify merged/removed drafts; it is not a second live catalog. Agent execution scripts must consume real environment resource bindings.

## Implementation and qualification are separate

All 76 registered cases now export real runners. Full selection includes all of them; environment preflight can still block a runner. The original execution records are retained under the configured `.runs` directory, including failed attempts and focused rechecks. The live catalog is the scripts themselves, not this coverage document.

The first full execution caught script races, incorrect source references and fixture ownership/ignore mistakes. Corrections were verified with focused real GUI/Skill/Core runs, followed by another full selection. Results must distinguish passes, product-contract failures, unresolved execution failures and environment blockers. A missing second identity or isolated fault/release fixture is not product failure or successful script qualification.
