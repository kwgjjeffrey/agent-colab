export const USECASE = {
  name: 'Discover native Session names instead of first instructions',
  description: `Preconditions: Cargo is available and the repository can compile Local Core.
Actions: exercise the real catalog discovery implementation against isolated Codex SQLite and Claude Code JSONL fixtures; rename only Codex metadata and discover again.
Expected: Codex name beats original instruction, latest CC customTitle beats summary, unchanged sources produce no changes, metadata-only rename updates the catalog, missing name falls back to title, and original transcript bytes remain intact. Fixtures are removed even on assertion failure.
Scope: Local Core catalog integration; not installed GUI, remote sharing, or release acceptance.`,
};
export const META = {
  "id": "context.sessions.discovery.native-title",
  "module": "context/sessions/discovery",
  "surface": "integration",
  "priority": "normal",
  "origin": "bug",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "affectedPaths": [
    "local/crates/local-api/src/sessions.rs",
    "local/crates/local-api/src/sessions/native_titles.rs"
  ],
  "statusReason": "Reviewed Run 20261007T132503Z-d7426da3: exact catalog scenario executed once; native provider fields, metadata-only rename, unchanged catalog, fallback and transcript preservation asserted; UUID-owned temporary stores cleaned by Drop. Core integration only, no installed GUI or sharing claim."
};
export async function run(ctx) {
  const result = await ctx.command('Exercise real native-title catalog with isolated provider stores', 'cargo',
    ['test', '--locked', '--manifest-path', 'local/Cargo.toml', '-p', 'colab-local-api', 'sessions::tests::native_title_catalog_regression', '--', '--exact']);
  ctx.assert('Catalog test exits successfully', result.code, 0);
  ctx.assert('Exactly the intended scenario executes (not zero tests)', /1 passed; 0 failed/.test(result.stdout), true);
}
