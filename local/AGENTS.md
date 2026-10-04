# Local Core artifact

Canvas Markdown conversion is owned by `canvas-codec/`: ProseMirror Markdown plus
`@tiptap/y-tiptap` reconcile changes into the existing Yjs replica. Package the helper
and its Node runtime with Core, not GUI or Electron. Keep unaffected nodes intact;
reject lossy affected regions and changes to mention/component identities before
applying any update. Rust retains durable replica/outbox ownership.

Implementation boundaries are indexed in `../docs/technical-design.md` §11.8, request payloads in
`../docs/architecture/agent-request-data-flow.md`, live release gates in
`../docs/validation-plan.md`, and the provider writer/queue evidence in
`../.trial/V-AGENT-WRITER-01-codex-writer/README.md`. Update those sources together when the Codex
runtime lifecycle changes.

Runtime sockets send a delayed 20-second WebSocket heartbeat. Do not emit the first heartbeat
immediately after connect: the Server may be waiting for the request-scoped command ACK, and control
frames must never be mistaken for command acceptance. Codex bindings include an adapter version;
version 1 `codex exec` threads are intentionally abandoned because they are hidden from Desktop;
version 2 per-request app-server bindings are also abandoned because their writer was released after
each command. Version 3 bindings belong to the one long-lived Local Core app-server and are the only
bindings the persistent manager resumes.

The Files picker is one product operation. Its default mode must allow selecting either one file or
one directory and return only the selected path; file-only and directory-only modes exist solely
for capabilities such as Skill source selection that genuinely require a directory.

Channel Messages uses Local Core as the sole authenticated client. Keep Conversation synchronization
and Agent runtime delivery separate: the Conversation stream reconciles message sequence gaps for
GUI/Skill, while a runtime-authenticated WebSocket receives complete Server-packaged commands for
one registered runtime. Local Core must not parse mentions, repeat blueprint policy, or fetch chat
context to build a task. It maps each Channel/blueprint binding to one provider-native session and
does not automatically mirror the provider's final response into the Channel. ACK a runtime command
on its own socket only after its complete envelope parses; provider completion remains a separate
HTTP receipt, and the request-scoped Skill reply remains the sole Agent-authored Channel path. Codex runtime turns retain `workspaceWrite` filesystem isolation but must enable network access so the Skill can reach the authenticated loopback Local API; do not solve this with `dangerFullAccess` or by exposing remote account credentials to the provider session.
GUI must never connect directly to Server. Presence is never authority. Read
docs/conversation-design.md before changing this boundary.

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

Agent runtime identity is installation-scoped. Store one stable device UUID in Local SQLite and
register one Server runtime per installed coding-agent Skill target. The first execution adapter is
Codex: map `(channel, blueprint)` to one provider thread ID locally, create it through Codex
app-server, and resume it for later requests. A binding is a durable logical conversation. Run one
long-lived app-server per Local Core and let it retain writer ownership for every Colab-managed
thread; Codex Desktop may read those threads but cannot write them. New independent commands must
use `thread/queue/add` with a stable request-derived `clientUserMessageId`. The owning app-server
persists the queue and automatically starts its next item when the thread is idle. Never use a
second `turn/start` as a queue operation: during an active turn it steers that same turn. Local Core
must observe turn/queue events and correlate completion, but must not create a second durable local
queue. On Core shutdown, unsubscribe all loaded threads before stopping the process; after a crash,
process exit releases writer ownership and the replacement app-server resumes persisted bindings.
Never rotate a binding merely because it is busy. Replace it only when Codex explicitly reports the
thread missing. A Core restart can race with Codex Desktop acquiring the writer; in that case keep
the original binding and submit through `thread/queue/add` without resuming or mutating the thread.
Each Local Core receives commands only from its own
runtime-authenticated WebSocket; the GUI/requesting device must never execute a remote runtime by
convenience. Provider processes receive the already packaged prompt and request-bound context/reply
commands; never accept a remote arbitrary shell command or let the model choose another Channel as
the report target.
Provider launch, resume, or result failures must be reported so the durable request leaves
`running`. Bound diagnostics and keep them out of Channel messages because they may contain local
paths; do not silently swallow execution failures in the polling loop.

Canvas uses one Local-Core-owned Yrs replica per account/canvas. Persist every local update and its
outbox row before attempting Server delivery, retain the same `clientUpdateId` across retries, and
advance `last_server_seq` only from ordered Server results. The account WebSocket carries
`canvas.invalidated` wakeups; durable update submission and cursor repair use HTTP. The Markdown/TXT
projection is a virtual interface, not a watched physical file. Keep projection rendering and patch
translation inside Local Core, reject edits to structured-component fences, and never expose CRDT
node identities to the Skill. The current supported Canvas Agent target is macOS.
Preserve Canvas folder ancestry when proxying metadata so Skill and GUI resolve the same canonical
`colab://channel/.../canvas/<folder...>/<document>` reference. Folder CRUD is metadata; it must not be
encoded as a Yjs document update.

Runtime workers are account-scoped, not foreground-session-scoped. Keep one worker for each
explicitly saved account/runtime association and refresh that account's credential independently
of the GUI's current account. Never cross-product legacy runtime IDs or thread bindings with saved
accounts to guess ownership; installation/registration must persist the scoped association.
Request-scoped context/reply commands must likewise resolve the request owner across saved
accounts. Provider child processes are bounded; a hang must become a durable failure rather than
permanent `running`.

On macOS the updater's `update.lock` OS flock is the running authority; progress JSON is only transfer detail. Never delete the lock file to recover ownership, or assume a download's completed state ends installation. Repeated update callers attach, and activated-versus-resident executable comparison recovers a lost caller's restart step. Read `update_status.rs` and `docs/validation-plan.md` for the installed cross-language lock and Canvas runtime acceptance evidence.
