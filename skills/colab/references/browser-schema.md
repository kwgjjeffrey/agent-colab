# Colab Browser response

Channel icon: `update-channel --channel REF --icon-file /absolute/icon.png`
reads at most 256 KiB of PNG/JPEG/WebP bytes, determines MIME from bytes and
encodes them for the existing Local Core Channel PATCH. `--icon-file` and `--icon`
are mutually exclusive. Omitted name remains unchanged. The authenticated Server
still enforces owner/admin permissions. The compact receipt adds `iconUpdated`
and `iconSha256` only after Server's response confirms the exact uploaded image;
no data URI or image bytes appear in stdout. Generate/resize using native Agent
image tools first; this thin client does not generate images or bypass Core.

Files setup: `inspect-source --source PATH [--exclude dist]` returns included and
excluded counts/bytes, transport-limit state and supported directory candidates.
Use only candidates' exact names, not globs. `sync-scope --ref REF` reads an owned
local Files scope; `--set [--exclude dist]` replaces the complete list (empty clears).
Its successful save receipt means publication was queued, not remotely completed.
Browser/Explorer Files share also accepts repeated `--exclude` values.

Browser is legacy; use Explorer for mixed Catalog discovery. Every command writes
one JSON envelope. Success uses `{ "ok": true, "data": ... }`; no universal null
cursor is emitted. Failure uses `{ "ok": false, "error": { "code": ...,
"message": ..., "retryable": ... } }`.

Canonical resources are `colab://`, `colab://channel/{channel-name}`, and `colab://channel/{channel-name}/{item-name}`. Path segments are URL-encoded when needed; UUIDs remain internal implementation keys. `use --ref` resolves, validates and materializes a Files item in one operation. Internal files are read with native file tools, Session content is consumed through `colab-session-reader read`, and Skills are installed through `colab-skill-tool` before the target Agent's native loader uses them.

`session-sources` returns Local Core's SQLite-indexed local Session metadata. Its `id` is a path-derived catalog ID used to disambiguate provider thread IDs that repeat across projects; pass that ID to `share --item-type session --source` when needed. It is not a remote Shared Item ID.

Resolution is scoped to Local Core's active account and active Organization, then narrowed by the complete descendant path. If the complete readable path still matches multiple resources, the command returns `ambiguous_reference` with human-useful candidate metadata and a `preciseRef` UUID fallback for each candidate.
