# Catalog workspace implementation

Rollback baseline: `2b96f07`. Work in the primary checkout; preserve old references.

## Delivery sequence

1. **Implemented; PostgreSQL contract verified — shared catalog domain.** Reuse existing Canvas directories as
   mixed catalogs without changing IDs. Root assets retain their existing state.
   Enforce same-Channel parents, cycle rejection and non-destructive deletion.
2. **Implemented; end-to-end pending — Agent interface.** Legacy Browser remains unchanged. Explorer
   lists direct children with bounded pagination, resolves paths and manages
   catalogs/placement. Return stable consumer references independently of paths.
3. **Implemented; visual/end-to-end pending — GUI workspace.** Replace tabs with Add, Message and mixed tree.
   Add retains Home use cases/activity plus actual creation/share controls.
   Reuse existing asset consumers and editor; name/trail left, actions right.
4. **Pending — impact/acceptance.** Update affected navigation helpers and cases;
   test persistence, authorization, cycle/deletion, legacy consumption and GUI
   workflows. Apply efficient tracing updates inline; broad registry audit later.
5. **Documentation updated; release pending.** Update AGENTS.md, product/interaction/
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
