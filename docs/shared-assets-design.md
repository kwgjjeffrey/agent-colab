# Source-owned shared assets (2026-10-09)

Approved: one owned source asset and publication, many Channel references. Names,
descriptions and Files scope belong to the asset; Catalog placement, ordering,
membership authorization and withdrawal belong to each reference. Last withdrawal
stops publication, retains content for 24 hours, then allows collection. Local
sources are never deleted. Quick Share remains a fixed, expiring capability.

Implementation stages:

1. Add `shared_assets`; preserve existing `channel_shares` IDs as references and
   preserve an opaque legacy publication anchor for existing revision foreign keys.
   Asset state is authoritative; old response columns are compatibility projections.
2. Register an opaque account/device/canonical-source identity through Local Core.
   New references reuse the asset. Existing local registrations are consolidated
   only from explicit equal canonical source/adapter ownership evidence, never names.
   A managed Skill's final symlink identifies its live installation slot, not its
   immutable version target; upgrading that slot preserves publication identity.
3. Core owns one source row, shadow repository, publication cursor/job and lock per
   asset. Reference mapping feeds GUI, Explorer, legacy Browser and consumers.
4. Reads authorize the requested active Channel reference before accessing shared
   revisions. Blob retrieval accepts membership in any active reference to that
   asset, not membership in the original publication Channel. GC and quota count
   assets once and protect all active references plus retained unreferenced assets.
5. Verify Session/Files/Skill cross-Channel reuse, concurrent registration,
   progression, global metadata/scope, reference-local placement/withdrawal,
   unauthorized access, last withdrawal/re-share, old links and old data.

Rollout is additive. Legacy clients can continue registering individual sources;
they cannot infer equality. New Core explicitly binds source identities and merges
proven local duplicates. No migration guesses identities from names or content.
Reclamation is delayed until references and retention both permit it; old binaries
must not be reactivated after consolidation unless the asset-aware Server remains.

Checkpoint: `aa3efdd`. Implementation commits: `dc26762`, `94486af`.
Status: accepted and published: Server 8 / migration 42 and macOS Core 102 /
promotion 204, installed and binary-verified in the daily App. GUI 150, Skill 57,
Shell and Windows unchanged. Core 102 adds exact lost-ack recovery.

Verified in isolated PostgreSQL 14: all migrations through 0042; projection,
legacy rename, independent withdrawal and 24-hour retention SQL assertions;
Files/Skill/Session registration, shared revision/snapshot reads, forbidden
outsider access, withdrawn publication-anchor continuation and expiry/re-share
contract test. Core Session unit tests retain all nine preview/parser checks.
Packaged Core 101 cross-Channel case passed 124 assertions, including concurrent
receiver materialization and exact initial/updated bytes: Run
`20261009T080837Z-c94ad994`, Round `20261009T091734Z-1cd6014b`.
Earlier fixture, cache-alias and watcher failures remain in the same Run.
Core 102: 32 passing unit tests, one explicitly ignored native-machine probe. Server:
10 passing API tests plus the opt-in PostgreSQL multi-reference contract test.
Withdrawals lock the asset before reference rows, matching publication lock order.
Retired merged assets lose their source key and cannot be rediscovered as publishers.
Migration 42 drains deferred FK events before enforcing NOT NULL. The populated
fixture and a production-backup rehearsal preserve all 127 old reference IDs.
Failed Server 7 rollout rolled back to Server 6 before fixed Server 8 deployment;
the production backup remains private and recoverable. Old Session content passed
authenticated segment size/digest readback after the additive migration.
Packaged Core 102 also passed 126 cross-Channel assertions in the same Run, Round
`20261009T094007Z-18f68241`. Its source was isolated at `c1fbbf9`, excluding the
concurrent uncommitted enterprise login integration. Lost acknowledgements recover
only when parent, offset, snapshot-linked segment digest and size all match; no
arbitrary remote head adoption or source-byte skipping is permitted.
Daily App PID 37516 runs the verified Core 102 binary. The user's large Session
cursor recovered from 1,482,637,821 to 1,491,046,662 bytes and synchronization
continues independently of local preview; full source synchronization is not
claimed complete. Owned regression references were all withdrawn and the three
isolated Core/Server test processes stopped; private evidence/backup retained.

Normal re-sharing must not wait on an in-progress large upload. Cursor locks are
required only while consolidating multiple historical publishers. Consolidation
enumerates active Server references before registration so it never reactivates
a withdrawn Channel placement. Startup and account switching run this ownership
repair; missing local sources are retained as legacy references rather than guessed.
