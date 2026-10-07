# Regression case review before script implementation

Status: accepted consolidation applied to cases; see coverage.md for the current inventory. Runtime substitution is still undecided. Original per-case table below is historical review evidence. Reviewed all 78 description-only cases and the existing pilots. Case discovery is not implementation evidence. No business tests were executed.

## Decision

Remove the one currently unsupported Browser-search case. Merge three overlapping scenarios, retaining all their distinct assertions. This reduces 78 drafted records to 74 scenarios before parameterized variations or release-scope decisions; it does not imply 74 browser scripts are required.

Do not combine Files registration with Files reading, or Skill registration with installation just to reduce counts. They have different entries and independently diagnosable outcomes. Share fixture setup and cleanup instead. Avoid a long dependent lifecycle script that hides which operation failed.

The deliberate runner failure fixture belongs to Trace's own verification rather than Colab business coverage. Move it out of the normal project case catalog when implementing this proposal; keep existing run evidence. Fold the GUI navigation pilot's useful assertions into Channel creation/discovery once that replacement is implemented. Keep the existing Skill discovery pilot, strengthening its currently weak generic JSON assertion to check actual authorized Channel content.

## Module proposal

Use the same depth only where it helps selection. Rename collaboration to channels and communication to messages so selectors name actual product capabilities. Move each resource handoff under its resource type. Combine Canvas realtime/recovery into canvas/sync and runtime availability/delivery into agents/runtime. Group Quick Share's five one-case branches into sharing/access. Keep installation of the Colab Skill (platform/skill-targets) distinct from consuming a shared Skill (context/skills/installing).

```text
identity/{accounts,organizations,devices,permissions}
channels/{channels,members,home}
context/{discovery,files,sessions,skills}
  <resource>/{sharing,reading,handoff,...}
messages/{messages,realtime}
agents/{configuration,invocation,policy,runtime,feedback,prompts}
canvas/{documents,editing,reading,sync,agents}
quick-share/{sharing,access}
platform/{installation,updates,skill-targets,recovery}
```

The duplicate channels/channels and messages/messages labels should be flattened to channels/lifecycle and messages/timeline during implementation. IDs remain stable where possible; Module and file placement can change without breaking historical run references. The tree must remain derived from META, not another separately maintained module registry.

## Cost and assertion corrections

- Priority is overused: normal discovery/CRUD should not automatically be release-blocking. Reserve critical for the main collaboration loop, authority boundaries, data preservation and exact prompt semantics.
- `cost=slow` was assigned from integration surface rather than measured behavior. Re-estimate by actual fixture setup and dependencies; surface does not determine cost.
- Current prerequisites list only local-core for many multi-account/runtime cases. Before scripts, explicitly identify isolated accounts, runtime control, provider access and disposal capability; missing fixtures are blockers.
- Some read-only metadata is inaccurate: Session paging appends source data; materialization writes a cache. Distinguish fixture mutations from product actions and correct effects before execution.
- No latency thresholds yet. Define visible completion or command exit per case, then establish representative baselines. Never equate a caller return with background sync completion.
- Existing tests were located, not executed or certified equivalent: skills/colab/tests/test_canvas.py, test_transfer.py, test_platform_compat.py and desktop messaging/Canvas tests are useful inventory inputs. Confirm assertion equivalence before claiming reused coverage.

## Questions for the owner

1. Should sign-in, clean install, update and process recovery be an independent release-acceptance scope? Recommended yes.
2. Is controlled runtime coverage plus a small real-Codex smoke set acceptable? A controlled runtime proves dispatch/protocol/prompt/reply behavior, never real provider compatibility; the real smoke remains required.

## Per-case disposition

| ID | Disposition | Proposed Module | Rationale / required refinement |
|---|---|---|---|
| `agents.configuration.blueprint` | Keep | `agents/configuration` | Distinct observable business outcome; retain independent result. |
| `agents.configuration.remove` | Refine | `agents/configuration` | Separate remove-from-Channel from global blueprint deletion; different scopes and failure causes. |
| `agents.delivery.offline` | Keep | `agents/runtime` | Distinct observable business outcome; retain independent result. |
| `agents.delivery.thread-binding` | Keep | `agents/runtime` | Distinct observable business outcome; retain independent result. |
| `agents.feedback.reply` | Keep | `agents/feedback` | Distinct observable business outcome; retain independent result. |
| `agents.feedback.work-details` | Keep | `agents/feedback` | Distinct observable business outcome; retain independent result. |
| `agents.invocation.forward` | Keep | `agents/invocation` | Distinct observable business outcome; retain independent result. |
| `agents.invocation.mention` | Keep | `agents/invocation` | Distinct observable business outcome; retain independent result. |
| `agents.invocation.multiple` | Keep | `agents/invocation` | Distinct observable business outcome; retain independent result. |
| `agents.policy.non-owner` | Keep | `agents/policy` | Distinct observable business outcome; retain independent result. |
| `agents.policy.owner-reissue` | Keep | `agents/policy` | Distinct observable business outcome; retain independent result. |
| `agents.prompts.canvas-assembly` | Keep | `canvas/agents` | Distinct observable business outcome; retain independent result. |
| `agents.prompts.message-assembly` | Keep | `agents/prompts` | Distinct observable business outcome; retain independent result. |
| `agents.runtime.availability` | Merge | `agents/runtime` | Into `agents.delivery.offline`: Check offline/delivering/running visibility within the same disconnect/reconnect scenario. |
| `canvas.documents.create-open` | Keep | `canvas/documents` | Distinct observable business outcome; retain independent result. |
| `canvas.documents.delete` | Keep | `canvas/documents` | Distinct observable business outcome; retain independent result. |
| `canvas.documents.move` | Keep | `canvas/documents` | Distinct observable business outcome; retain independent result. |
| `canvas.editing.agent-patch` | Keep | `canvas/editing` | Distinct observable business outcome; retain independent result. |
| `canvas.editing.stale-patch` | Keep | `canvas/editing` | Distinct observable business outcome; retain independent result. |
| `canvas.editing.text-roundtrip` | Keep | `canvas/editing` | Distinct observable business outcome; retain independent result. |
| `canvas.mentions.section` | Merge | `canvas/mentions` | Into `agents.prompts.canvas-assembly`: Use the real GUI mention and capture the exact resulting section prompt in one scenario. |
| `canvas.reading.search-pages` | Keep | `canvas/reading` | Distinct observable business outcome; retain independent result. |
| `canvas.realtime.convergence` | Keep | `canvas/sync` | Distinct observable business outcome; retain independent result. |
| `canvas.recovery.outbox` | Keep | `canvas/sync` | Distinct observable business outcome; retain independent result. |
| `collaboration.channels.create-command` | Keep | `channels/lifecycle` | Distinct observable business outcome; retain independent result. |
| `collaboration.channels.create` | Keep | `channels/lifecycle` | Distinct observable business outcome; retain independent result. |
| `collaboration.channels.rename` | Keep | `channels/lifecycle` | Distinct observable business outcome; retain independent result. |
| `collaboration.discovery.ambiguous-reference` | Keep | `context/discovery` | Distinct observable business outcome; retain independent result. |
| `collaboration.discovery.search` | Remove from current scope | `channels/discovery` | Current colab-browser parser has no search subcommand. Design prose is not an implemented contract; preserve the request in product planning if desired. |
| `collaboration.home.activity` | Keep | `channels/home` | Distinct observable business outcome; retain independent result. |
| `collaboration.members.invite` | Keep | `channels/members` | Distinct observable business outcome; retain independent result. |
| `collaboration.members.remove` | Keep | `channels/members` | Distinct observable business outcome; retain independent result. |
| `collaboration.members.roles` | Keep | `channels/members` | Distinct observable business outcome; retain independent result. |
| `communication.messages.nonce` | Contract test | `messages/timeline` | Retain coverage with controlled inputs; do not build expensive full-browser fault injection for this assertion. |
| `communication.messages.reply-context` | Keep | `messages/timeline` | Distinct observable business outcome; retain independent result. |
| `communication.messages.send` | Keep | `messages/timeline` | Distinct observable business outcome; retain independent result. |
| `communication.messages.skill-read` | Keep | `messages/timeline` | Distinct observable business outcome; retain independent result. |
| `communication.realtime.account-switch` | Merge | `messages/realtime` | Into `identity.accounts.switch`: Fold delayed realtime and pending replies into account-isolation assertions. |
| `communication.realtime.catch-up` | Keep | `messages/realtime` | Distinct observable business outcome; retain independent result. |
| `context.files.reading.materialize` | Refine | `context/files/reading` | Materialization writes a managed cache; clarify effects and avoid asserting OS read-only mode without confirming the implementation. |
| `context.files.reading.preview` | Keep | `context/files/reading` | Distinct observable business outcome; retain independent result. |
| `context.files.reading.safe-paths` | Contract test | `context/files/reading` | Retain coverage with controlled inputs; do not build expensive full-browser fault injection for this assertion. |
| `context.files.recovery.retry` | Keep | `context/files/recovery` | Distinct observable business outcome; retain independent result. |
| `context.files.sharing.continuous-update` | Keep | `context/files/sharing` | Distinct observable business outcome; retain independent result. |
| `context.files.sharing.register` | Keep | `context/files/sharing` | Distinct observable business outcome; retain independent result. |
| `context.files.sharing.scope` | Keep | `context/files/sharing` | Distinct observable business outcome; retain independent result. |
| `context.files.sharing.withdraw` | Keep | `context/files/sharing` | Distinct observable business outcome; retain independent result. |
| `context.handoff.files` | Keep | `context/files/handoff` | Distinct observable business outcome; retain independent result. |
| `context.handoff.session` | Keep | `context/sessions/handoff` | Distinct observable business outcome; retain independent result. |
| `context.handoff.skill` | Keep | `context/skills/handoff` | Distinct observable business outcome; retain independent result. |
| `context.sessions.reading.outputs` | Keep | `context/sessions/reading` | Distinct observable business outcome; retain independent result. |
| `context.sessions.reading.page` | Refine | `context/sessions/reading` | Appending the producer Session is a write: correct effects and use an isolated fixture. |
| `context.sessions.recovery.cached-read` | Refine | `context/sessions/recovery` | Disconnect only the isolated test transport, not the user network. |
| `context.sessions.sharing.register` | Keep | `context/sessions/sharing` | Distinct observable business outcome; retain independent result. |
| `context.sessions.sharing.withdraw` | Keep | `context/sessions/sharing` | Distinct observable business outcome; retain independent result. |
| `context.skills.discovery.sources` | Keep | `context/skills/discovery` | Distinct observable business outcome; retain independent result. |
| `context.skills.installing.conflict` | Refine | `context/skills/installing` | Independently verify unmanaged-name conflict and managed local modification. |
| `context.skills.installing.ensure` | Keep | `context/skills/installing` | Distinct observable business outcome; retain independent result. |
| `context.skills.installing.uninstall` | Keep | `context/skills/installing` | Distinct observable business outcome; retain independent result. |
| `context.skills.sharing.register` | Keep | `context/skills/sharing` | Distinct observable business outcome; retain independent result. |
| `context.skills.sharing.withdraw` | Keep | `context/skills/sharing` | Distinct observable business outcome; retain independent result. |
| `identity.accounts.logout` | Keep | `identity/accounts` | Distinct observable business outcome; retain independent result. |
| `identity.accounts.signin` | Release scope pending | `identity/accounts` | Requires a clean installation, authentication or process lifecycle fixture; keep outside routine business regression unless requested. |
| `identity.accounts.switch` | Keep | `identity/accounts` | Distinct observable business outcome; retain independent result. |
| `identity.devices.disconnect` | Keep | `identity/devices` | Distinct observable business outcome; retain independent result. |
| `identity.organizations.switch` | Keep | `identity/organizations` | Distinct observable business outcome; retain independent result. |
| `identity.permissions.unauthorized` | Refine | `identity/permissions` | Parameterize resource types with named independent assertions; include direct API checks, not discovery filtering alone. |
| `platform.installation.bootstrap` | Release scope pending | `platform/installation` | Requires a clean installation, authentication or process lifecycle fixture; keep outside routine business regression unless requested. |
| `platform.recovery.core-restart` | Release scope pending | `platform/recovery` | Requires a clean installation, authentication or process lifecycle fixture; keep outside routine business regression unless requested. |
| `platform.skill-targets.install-default` | Release scope pending | `platform/skill-targets` | Requires a clean installation, authentication or process lifecycle fixture; keep outside routine business regression unless requested. |
| `platform.updates.changed-only` | Release scope pending | `platform/updates` | Requires a clean installation, authentication or process lifecycle fixture; keep outside routine business regression unless requested. |
| `platform.updates.check` | Release scope pending | `platform/updates` | Requires a clean installation, authentication or process lifecycle fixture; keep outside routine business regression unless requested. |
| `platform.updates.rollback` | Refine | `platform/updates` | Separate integrity rejection before activation from recovery after failed activation. |
| `quick-share.consumption.receive` | Refine | `quick-share/sharing` | Treat Files/Session/Skill as independently reported variants sharing fixture helpers. |
| `quick-share.creation.snapshot` | Keep | `quick-share/sharing` | Distinct observable business outcome; retain independent result. |
| `quick-share.management.expiry` | Keep | `quick-share/sharing` | Distinct observable business outcome; retain independent result. |
| `quick-share.permissions.expired-revoked` | Refine | `quick-share/access` | Use independent expiry and revocation variations; do not make one depend on the other. |
| `quick-share.security.redaction` | Contract test | `quick-share/access` | Retain coverage with controlled inputs; do not build expensive full-browser fault injection for this assertion. |

## Execution review — 2026-10-07

All 76 registered scenarios now have runners; none was removed or marked rotten to make the suite green. Full runs and focused rechecks remain in the project run directory. The latest verification counts are recorded in validation-plan.md after execution, rather than inferred from exports.

Execution corrected several test defects: request state is `succeeded`, result matching must use the exact request identity, persisted work events/rendered replies arrive asynchronously, Canvas references include their resource kind, and GUI handoff references can use readable names. Skill handoff depends on completed installation-state loading. Session source discovery resolves the provider UUID against the actual source filename, not an assumed equality with the catalog's filename-stem identifier.

Quick Share consumption wording now follows the documented interface: received Session provides local transcript bytes and a source adapter; it does not promise a normal shared-Session Reader handle. The test invokes the actual packaged transfer CLI with an anonymous client and verifies Files/Session/Skill content. Fixed-snapshot tests change a real runtime Session by issuing a subsequent instruction, never by forging or editing its transcript.

Files fixture failures were traced to an unusable local-source binding and inherited Git ignores. A new contributor-owned share was prepared and its published root verified. Disposable source repositories bound ignore rules without changing the outer repository. Native path selection remains a declared fixture boundary.

Preserve product-contract failures such as rejection of a pinned Session cursor after source growth. Real executed-blueprint deletion has returned `blueprint_delete_failed`; the message sender foreign key lacks deletion handling, a concrete lead rather than proof from a mock. Missing second identities and isolated fault/release fixtures remain environment blockers.

Latest qualification: completed full run 20261007T064300Z-a39585a6 plus focused rechecks 20261007T070231Z-d5d9e782 and 20261007T070725Z-8fc400be cover all 76 IDs with latest evidence of 39 passes, three failures and 34 preflight blockers. Canvas restoration passed twice; File preview reports four independent variants; Home prepares actual activity rather than requiring hand-entered labels; Skill conflict and uninstall prepare and restore only the managed regression-owned Skill. Actor-history preparation explicitly requests a Channel reply through the supplied command, rather than accepting an unposted model final answer as message history.
