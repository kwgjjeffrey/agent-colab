# Catalog workspace implementation

Rollback baseline: `2b96f07`. Work in the primary checkout; preserve old references.

## Delivery sequence

1. **Implemented; PostgreSQL contract verified — shared catalog domain.** Reuse existing Canvas directories as
   mixed catalogs without changing IDs. Root assets retain their existing state.
   Enforce same-Channel parents, cycle rejection and non-destructive deletion.
2. **Implemented; scoped end-to-end passed — Agent interface.** Legacy Browser remains unchanged. Explorer
   lists direct children with bounded pagination, resolves paths and manages
   catalogs/placement. Return stable consumer references independently of paths.
3. **Implemented; scoped GUI acceptance passed — GUI workspace.** Replace tabs with Add, Message and mixed tree.
   Add retains Home use cases/activity plus actual creation/share controls.
   Reuse existing asset consumers and editor; name/trail left, actions right.
4. **Pending — impact/acceptance.** Update affected navigation helpers and cases;
   test persistence, authorization, cycle/deletion, legacy consumption and GUI
   workflows. Apply efficient tracing updates inline; broad registry audit later.
5. **Published; macOS installation and native acceptance passed.** Stable promotion 0.1.170-dev
   contains Core 95, GUI 118 and Skill 55; Electron remains 23. All changed
   artifacts passed public size/hash readback. Update AGENTS.md, product/interaction/
   technical/Agent interface, installed Skill instructions and live results.
   Commit, build only changed independent units, deploy/publish and verify actual
   installed clients. No completion claim based on compilation alone.

## Checks at every stage

- Do not expose preview bodies during discovery or materialize entire Sessions.
- Catalog moves must not change asset identity or loosen existing permissions.
- Existing Canvas CRDT/outbox/realtime protocol is unchanged.
- Every visible action is real and exposes errors; no placeholder success.
- Keep unrelated local changes and independent version ownership intact.
- Keep the persistent Channel header: icon, double-click name editing, member
  AvatarGroup and Quick Share. Only the navigation tabs below it are replaced.


### 2026-10-09 Catalog counts and uploader identity

Server catalog children/trails now return nullable childCount and contributorMemberId/contributorName/contributorAvatarUrl. Counts include only direct Catalogs, non-archived Canvas and active shares; existing parent indexes support the counts and stable IDs/placement remain unchanged. GUI shows counts even when collapsed (including zero), and Files/Session/Skill uploader avatars open the existing UserIdentity profile without changing selection. Added sidebar right padding after real pointer acceptance found the scrollbar intercepting the Skill avatar.

Server 0.1.4 production build/deployment/readiness passed. GUI 0.1.139-dev / promotion 0.1.191-dev published and normally installed; actual ui.json verified. TypeScript/build passed. Public readback verified 1319883 bytes / SHA-256 `aeca5e8c1bc94d24cab5a788c8aa818f0f167a38c790858b0509f12654172ee8`. Core, Skill and Electron were not rebuilt. Round 3 `20261009T042902Z-c7350753` in Run `20261009T042513Z-c3ff7f2b` passed all 23 assertions: direct versus recursive count, collapsed label, all three uploader identities/profiles, selection preservation and owned cleanup. Four screenshots reviewed. Earlier selector-animation and scrollbar failures remain recorded. Case qualified active; temporary daily-client index removed. No full-suite acceptance is claimed.
