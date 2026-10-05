# V-CANVAS-02 — formal Core/Skill/recovery validation

Status: **passed on macOS, 2026-10-03**.

This is an in-project validation of the formal Server, Local Core and packaged Skill entrypoint. It is distinct from the pre-implementation codec trial `F-CANVAS-01`.

## Components exercised

- deployed Rust Server `0.1.98-dev` and PostgreSQL migration `0024_canvases.sql`;
- release-built macOS Local Core `0.1.67-dev` with a SQLite copy of the signed-in account;
- packaged `skills/colab/bin/colab-canvas` `0.1.44-dev`;
- real Channel `1st channel` and Canvas `Canvas E2E 2026-10-03`;
- real Tiptap/Yjs update-v1 fixture from `F-CANVAS-01`.

## Verified path

1. `colab-canvas create` created Canvas `4cc62a96-403e-423f-b0c6-6493486389e8` through Local Core and deployed Server.
2. A real Yjs update was submitted through Local Core and received Server sequence `1`.
3. `colab-canvas read` returned the deterministic `document.md` projection, including heading, bold text, list and the stable structured-component fence.
4. A Codex-shaped `*** Update File: document.md` patch changed `Release validation is pending.` to `Release validation passed through packaged colab-canvas.` and received sequence `2`.
5. Local Core was restarted against an intentionally unreachable Server. Update `00000000-0000-4000-8000-000000000123` returned an offline error, but SQLite contained exactly one `pending` outbox record with the 89-byte Yjs update.
6. The same Core/SQLite was restarted against the deployed Server. Its background recovery changed that record to `acked`, assigned sequence `3`, and the packaged reader returned `Recovered from durable Local Core outbox.` with `syncState: synced`.

The Server update identity is idempotent and the outbox reuses it across retries. No update was inserted manually into PostgreSQL, and the final content was read through the installed-form Skill protocol rather than an internal Rust helper.

## Not claimed by this validation

- two-human simultaneous browser caret/awareness UX;
- typed query-list component insertion/edit/resolve;
- snapshot compaction and scale limits;
- Windows support.
