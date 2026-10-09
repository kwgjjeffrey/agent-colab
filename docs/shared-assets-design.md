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

Checkpoint: `aa3efdd`. Status: implementation, not released or accepted.

Verified in isolated PostgreSQL 14: all migrations through 0042; projection,
legacy rename, independent withdrawal and 24-hour retention SQL assertions;
Files/Skill/Session registration, shared revision/snapshot reads, forbidden
outsider access, withdrawn publication-anchor continuation and expiry/re-share
contract test. Core Session unit tests retain all nine preview/parser checks.
The first real Core/Server cross-Channel case passed after correcting an invalid
fixture exclusion: Run `20261009T080837Z-c94ad994`, Round
`20261009T081051Z-86238ee9`. Packaged artifacts and public deployment are pending.

Normal re-sharing must not wait on an in-progress large upload. Cursor locks are
required only while consolidating multiple historical publishers. Consolidation
enumerates active Server references before registration so it never reactivates
a withdrawn Channel placement. Startup and account switching run this ownership
repair; missing local sources are retained as legacy references rather than guessed.
