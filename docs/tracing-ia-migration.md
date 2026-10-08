# Mixed workspace tracing and regression migration

## Boundaries

The mixed tree replaces type tabs, not business protocols. GUI and Skill still
call Core; Core still calls Server. Explorer discovers catalog children and stable
asset identities; Browser stays legacy and usable. Moving or renaming an item does
not alter its consumer identity. A preview must read an asset, not its collection.

| Changed entrance | Current operation | Regression evidence |
| --- | --- | --- |
| Native sidebar rename, catalog creation/removal, placement | `workspace.mutate` | Catalog workspace, inline Canvas rename, Canvas Move, catalog drag |
| Selected Session recent preview | `sessions.preview` | Four-asset details, missing original source, Session registration |
| Shared directory / single file preview | `files.browse` and existing file read roots | Actual text/image/binary previews; single-file component and native acceptance |
| Filled handoff / More secondary actions | Existing asset handoff/withdraw/scope/retry operations | Details, Files/Skill withdrawal, sync scope, failed-publication Retry |
| Selected task transcript | `agents.work.read` and existing execution roots | Exact request work details; failed-event-upload recovery |
| Channel rail / Home / Message / Add | Existing Channel/message roots | Onboarding, navigation, activity and Quick Share |

`canvas.create`, `canvas.title` and `canvas.move` remain registered for the legacy
standalone collection. They must not be used as proxies for mixed workspace
mutations. Their IDs are preserved for historical trace interpretation.

## Audit method and checks

1. Search repository case/helper selectors for removed tabs, `canvas-tree`,
   collection rows (`div.group`) and the old header Quick Share button.
2. Replace positive navigation with exact mixed-item IDs, native rename, More
   and Add cascade. Negative assertions that tabs are absent remain valid.
3. Scope Channel clicks to the Channels rail: its name also exists in breadcrumbs.
4. Remove obsolete Tab locator metadata (64 entries); relocate directory regions
   to `catalog-items`; preserve operation IDs and meaningful completion boundaries.
5. Check the registry and then inspect actual causally connected GUI/Core/Server
   traces. Registry/source validation alone does not prove export or completion.
6. Plan and execute changed-capability cases with matching filters. Preserve
   failure rounds, distinguish script/environment defects, and qualify repaired
   cases only after real assertions and cleanup are reviewed.

Current registry check: 133 operations, four independently owned registries.
Confirmed backend samples: `bf6bc28cae1061451d4de9453435fc39` for workspace mutation
and `841a5f2a88b139ffa66ec0414f5fc8dc` for Session preview. Both finish successfully
at `result.state_committed` and include correctly parented Core/Server requests.
This is bounded evidence, not population latency or an SLO claim.

Task-event retry has a real fault-injection case: only event POSTs fail, the task
result completes, then restoring upload yields the same request's actual work in
the GUI. The durable worker uses the record's owning account, never the active
account by convenience. Healthy historic tasks without captured events cannot be
reconstructed; the UI must report that limitation, not invent a transcript.

## Test environment pitfalls found and repaired

The owner GUI proxy is 53482 and must use the owner discovery file for CLI too.
Its Core tracing flag was off and is now enabled for validation. The receiver
initially ran Core 93 despite a newer GUI; its catalog route returned 404. Restarted
the owned receiver on Core 97 and rechecked Canvas Move. A fault proxy launched
as a short-lived shell child exited; the explicit long-running test process now
keeps that boundary alive. None of these failures is deleted or counted as green.

HTTP route overrides alone do not authenticate browser WebSocket handshakes.
Receiver/isolated GUI helpers now set Core's existing local HttpOnly cookie as
bootstrap would, and affected cases serialize shared localhost browser auth.
Offline Catalog children/trail use Core's existing account-scoped discovery cache,
including invalidation on permission denial; no new cache protocol or GUI business
logic was introduced. GUI metadata includes the workspace dependency so impact
filters do not miss cases when their shared navigation changes.

Exact verified runs and release acceptance live in validation-plan.md. Cases not
re-executed in this scope retain trial status and historical evidence; this audit
does not claim the entire repository test catalog passed.
