# Agent Colab regression coverage — review draft

This document defines selection rationale before script implementation. The project owns these cases; Trace owns discovery, filtering and execution. New files contain literal USECASE and META only. No new runner has been implemented or executed.

## Top-down capability tree

The hierarchy follows business responsibility. GUI, Skill and integration are entry surfaces, not separate business modules. Each slash-separated Module path is a subtree: selecting `context` includes `context/files`, `context/sessions` and `context/skills`. The GUI and agent derive the tree from case metadata; no second module registry exists.

### agents — 14 new cases

Bind a real runtime, enforce invocation policy, assemble the exact prompt, deliver and return results.

- `agents/configuration`
- `agents/delivery`
- `agents/feedback`
- `agents/invocation`
- `agents/policy`
- `agents/prompts`
- `agents/runtime`

### canvas — 10 new cases

Keep human editing and agent Markdown editing on one durable, convergent document.

- `canvas/documents`
- `canvas/editing`
- `canvas/mentions`
- `canvas/reading`
- `canvas/realtime`
- `canvas/recovery`

### collaboration — 9 new cases

Create the relationship, discover its resources and manage membership.

- `collaboration/channels`
- `collaboration/discovery`
- `collaboration/home`
- `collaboration/members`

### communication — 6 new cases

Persist and distribute user-visible conversation reliably.

- `communication/messages`
- `communication/realtime`

### context — 22 new cases

Follow each context type from producer registration to agent consumption, freshness and withdrawal.

- `context/files/reading`
- `context/files/recovery`
- `context/files/sharing`
- `context/handoff`
- `context/sessions/reading`
- `context/sessions/recovery`
- `context/sessions/sharing`
- `context/skills/discovery`
- `context/skills/installing`
- `context/skills/sharing`

### identity — 6 new cases

Establish identity, tenant scope and authorization before any context is visible.

- `identity/accounts`
- `identity/devices`
- `identity/organizations`
- `identity/permissions`

### platform — 6 new cases

Make installation, component updates and recovery safe and usable.

- `platform/installation`
- `platform/recovery`
- `platform/skill-targets`
- `platform/updates`

### quick-share — 5 new cases

Deliver a fixed capability-scoped snapshot without adding membership.

- `quick-share/consumption`
- `quick-share/creation`
- `quick-share/management`
- `quick-share/permissions`
- `quick-share/security`

## Why these cases

Select an observable business outcome, then add its important boundary: access denial, stale context, conflicting identity, retry, offline recovery or destructive overwrite. Separate GUI and Skill cases when they use genuinely different entry contracts. Cross-client synchronization and provider-runtime behavior use integration cases instead of duplicating every click sequence.

Critical covers the collaboration loop, authorization, prompt correctness, durable writes and installation safety. Normal covers discovery ergonomics and recoverable operations. Extended is reserved for additional expensive variations; it is not a reason to bury core correctness.

`effects=isolated-write` is a design requirement for scripts, not proof of sandboxing: future scripts must create disposable identities/resources or a sandbox installation, clean up only their own resources and never exercise destructive operations on the user's live workspace. Multi-account and runtime tests need controlled fixtures. Cost is an initial planning estimate, not a measured performance result.

## Review and implementation order

1. Review names, Purpose, Preconditions, Actions and Expected results in the GUI. Adjust business expectations before implementation.
2. Implement the smallest critical vertical slices: Files/Session consumption, message-to-Agent prompt and reply, Canvas read/patch, access isolation.
3. Add cross-client recovery and safe update fixtures after those slices have trustworthy evidence.
4. Establish representative latency baselines, then add justified performance assertions. Prompt-content assertions are functional engineering checks, not latency measurements.

## Existing executable pilots

Two previous scripts remain executable under `collaboration/channels/discovery`: GUI navigation and Skill Channel discovery. The deliberately rotten runner diagnostic remains under `test-infrastructure/runner`, outside product coverage. It is excluded from normal regression.

## Explicit exclusions

Standalone DM, project management, audio/video, general bot marketplaces, unimplemented runtime adapters and Windows-specific qualification are not included in this macOS-first draft. Organization invitations and broader onboarding under active design are not silently treated as validated functionality. Existing product documentation includes both implemented behavior and roadmap text; this case inventory specifies expectations for review and does not certify feature implementation.
