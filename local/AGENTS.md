# Local Core artifact

Local Core is the only local business process and SQLite writer. It must continue working without Electron or GUI. Desktop and Skill are clients of the same Local API and must observe the same authorization and state.

Local Core also hosts the active Desktop GUI static resources on its loopback origin. Browser-hosted GUI capabilities that require an absolute local path use Local Core's native picker endpoint; Electron may adapt the same intent but is never required.

File change detection and publication are separate stages. Watchers only upsert a durable `local_jobs` row with a two-second quiet window; the worker claims jobs atomically, computes a shadow-Git snapshot and transfers data. A generation counter preserves edits arriving while an older generation runs. First registration uses the same durable path and returns `preparing` once the job is accepted; never hold a GUI request open until publication finishes. Failed jobs expose their last error, retry with exponential backoff, and can be advanced manually. A Core restart resets leased `running` jobs to `pending`. Consumers return the last materialized snapshot immediately and enqueue a deduplicated refresh.

The standalone alpha transports one opaque Git pack per revision. Before `pack-objects`, reject an index containing a file over 100 MiB or total content over 200 MiB; the Server body limit is 256 MiB. Never buffer an unbounded pack and wait on an upload that cannot be accepted. Chunked/resumable upload is a later transport improvement, not a different version model.

Each contributed Files source has exactly one Colab exclusion source of truth: its shadow repository's `$GIT_DIR/info/exclude`. Local API scope reads and writes that file directly. SQLite stores only the source and shadow-repository locators; never mirror exclusion patterns into a column or settings row. The source project's `.gitignore` remains Git-effective and read-only to Colab.

Installation management is an adapter, not a second updater: `system.rs` exposes an allow-listed Local API and invokes the packaged `colab-setup`. GUI code may display receipts and request operations but must never mutate artifact or Agent Skill directories directly.

For managed updates, activate immutable artifacts first, return the HTTP result, then let the resident Core exit after a grace period so the platform supervisor starts `current/core`. macOS uses launchd; Windows uses a per-user Task Scheduler entry and a detached delayed trigger after update. Never restart before the caller has received the result. Non-managed Core processes must report restart-required rather than killing an unknown parent workflow.

Device preferences such as the default coding Agent live in `local_settings`. Platform application launching is also allow-listed by Agent id in `system.rs`; GUI must never pass an arbitrary executable name.

Colab access tokens are resolved through the shared `access_token` boundary. It proactively
rotates an expired or near-expiry pair through Server, serializes rotation with
`auth_refresh_lock`, persists the new pair before exposing it in memory, and never returns either
credential through Local API. Feature modules must not refresh independently: concurrent use of
one rotating refresh token is replay and causes Server to revoke that session family.

The implemented Local API chooses an OS-assigned loopback port on first installation and atomically publishes a mode-0600 discovery file containing the endpoint, process metadata, API version and a high-entropy bearer. Endpoint and bearer are reused across process restarts so ordinary browser tabs retain the same origin and HttpOnly cookie; PID is rewritten on every start. Desktop, Electron and the Python Skill resolve the Core through that file. API requests enforce bearer/cookie authentication plus Host and Origin checks. Preserve this single transport instead of adding fixed ports, Unix sockets or a second GUI-owned backend.

On Windows, setup pins mutable installation state under `%LOCALAPPDATA%\AgentColab`, uses directory junctions for active immutable versions so ordinary users do not need symlink privilege, and invokes the extensionless Python setup through `python`. Keep Windows path/service decisions inside platform adapters; do not leak them into synchronization use cases.

Session sharing is implemented in `sessions.rs`. Preserve its three independent cursors: the contributor `last_byte_offset` advances only after the Server accepts an opaque source segment; `snapshot_id` pins the immutable segment chain materialized under the OS application-data directory; the Reader cursor paginates normalized turns inside exactly that snapshot. A publication pass freezes the source length and uploads bounded groups of complete JSONL records, persisting offset and parent snapshot after every accepted segment so retry resumes from durable progress. All publication callers for one Share must acquire its `session_sync_locks` entry before reading the durable cursor because the Server append is parent-snapshot CAS. Contributor source lookup is scoped to the active user: a consumer on a shared device may materialize another member's Session but must never publish through that member's source registration. Never store normalized messages on the Server. Codex, MyFlicker and Claude Code keep separate source adapters, with projection occurring only on local read. MyFlicker discovery covers current CLI (`~/.myflicker/projects`), legacy CLI (`~/.codeflicker/projects`) and Desktop (`~/.myflicker/sessions/*/message/cache.jsonl`); exclude nested `requests/` payloads and preserve the Desktop-specific rollback/overwrite adapter. Shared Skill consumption uses `skills.rs` installer adapters rather than generic Files browsing. Its catalog unifies discovered and user-selected source paths, shadow Git `root_oid` is the sole shared version, and installation receipts protect unmanaged or locally modified target directories.

Files preview raw bytes are served only by the authenticated loopback API. Preserve canonical-path containment checks and stream from `tokio::fs::File`; do not replace the raw endpoint with `fs::read`, base64 JSON, or a third-party preview upload. Text preview remains separately bounded because it intentionally materializes a UTF-8 string.

Local Session discovery is separate metadata. `local_session_catalog` stores only a path-derived catalog ID, provider, thread/session ID, title, source locator, adapter, size/mtime and update time. The path-derived ID is required because a provider thread ID can repeat across project directories. Its background refresher may stat provider files and parse changed headers; `/v1/session-sources` must remain a SQLite-only searchable query and must never scan transcript directories or store transcript content.

Another member's Files materialization is a disposable cache, not an editable collaboration copy. Do not rely on filesystem mode bits for authority: every `use` refresh reconciles it to the server-authoritative root, and local edits may be overwritten without merge or upload. Cache enough remote share metadata to return the same `updatedAt`, contributor name and avatar from both fresh and cached materialization paths.

Quick Share lives in `transfers.rs` and is independent of the authenticated Channel graph. A Transfer accepts exactly one source. Creation freezes it first: Files and Skills reuse a one-off shadow-Git pack, while Sessions are copied to a staging file before a streaming upload so concurrent provider appends cannot change the snapshot boundary. Read/revoke capabilities and the source summary live only in the private Local Core SQLite store; management APIs mediate listing, expiry changes and revoke so the browser never persists revoke secrets. Receive streams the immutable item through SHA-256 verification into a temporary file, atomically materializes it under the platform application-data `transfers/` directory, and returns paths/tree metadata without logging the capability. A random stable local reader ID supports anonymous usage aggregation; attach the current account session when available, but receiving must remain usable without login. It must not register watchers, silently join an Organization, or reuse Channel share records.

Never place cache or mutable runtime data inside the source checkout. Use platform application data/cache directories. Never touch a shared source's own `.git`. Materialization is read-only from Colab's perspective and must use staging plus atomic replacement.

Split adapters (`watcher`, `git`, `server`, `persistence`) from use cases. Comment CAS, retry, atomicity, path-safety, and recovery invariants.

Conversation/DM runtime work is designed but not implemented. A future Local Core keeps an
outbound authenticated connection, claims an authorized Agent Request with a short lease, and maps
each Conversation/blueprint binding to one provider-native session in local SQLite. Online presence
is never execution authority. Provider processes receive only the triggering context and a
request-bound progress/final reporting command; never accept a remote arbitrary shell command or
let the model choose another Conversation as the report target. See `docs/technical-design.md`
section 11.8 before implementing this boundary.
