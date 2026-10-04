# Server deployment

While waiting for `agent.command.accepted`, handle WebSocket Ping/Pong frames and continue waiting for
the exact request ID. A control frame is transport liveness, never business acknowledgement.

Channel Messages uses the Colab-owned IM domain. PostgreSQL is authoritative for membership,
ordered messages, cursors, Agent blueprints/participation and Agent Request state. Axum WebSocket
has two explicit protocols: Conversation carries typed invalidations whose reconnect repairs from
PostgreSQL sequence cursors, while runtime delivery carries complete executable commands. Do not add
Matrix identities, an external IM service, or a second message store. Read
docs/conversation-design.md before changing these boundaries.

The Conversation socket emits a text heartbeat every 15 seconds and reads peer close/control frames.
This is a transport-liveness invariant, not a message event: proxies and sleeping laptops can leave
a browser socket half-open without an `onclose`, so the GUI watchdog must be able to observe silence,
reconnect, and repair from the PostgreSQL message sequence.

Mention authorization uses the structured blueprint UUID. The display `@name` is context only, and
request state is exposed independently from ordered messages.

`server/api` is the protocol source. `server/standalone` is the current Rust/PostgreSQL implementation. A future Supabase implementation must implement the same domain API without leaking Supabase types into clients.

The server registers organizations, members, Channels, Shared Items, revisions, sessions, and authorization. Blob content is stored behind a storage port. PostgreSQL migrations are append-only after deployment.

Opaque session refresh tokens are rotating one-time capabilities. `session_refresh_tokens` retains
consumed hashes so replay is distinguishable from an unknown token; replay revokes the entire
session family in the same transaction. Clients must replace access and refresh credentials
atomically and must never retry a refresh with the previous token.

Channel Files and Skill Git packs use the shared `blobs.rs` streaming boundary: request bodies are
written to a temporary file with a 256 MiB hard limit, fsynced, and atomically renamed; downloads
stream from disk. Active Files/Skill revisions share a 2 GiB per-contributor quota serialized by a
PostgreSQL advisory transaction lock. Hourly Blob GC computes reachability from active Channel
shares and unexpired Quick Shares, then deletes unreferenced files only after a one-hour grace
period. Do not reintroduce request-sized `Bytes`/`fs::read` for these routes.

Organization invitation creation and email delivery are joined by the PostgreSQL
`email_outbox`. The invitation and notification intent commit together; the HTTP request returns
`queued` without waiting for a provider. A `FOR UPDATE SKIP LOCKED` worker lease retries failures
with capped exponential backoff. Successful rows are deleted so their plaintext, short-lived invite
token is not retained after delivery. Provider adapters remain in the email crate; invitation
business logic must not call SMTP or Cloudflare directly.

Quick Share is implemented by `quick_transfers` / `quick_transfer_items` / `quick_transfer_accesses` and the isolated API/persistence modules named `transfers.rs`. It is not a temporary Channel and never creates Organization membership. One Transfer contains exactly one item. Upload, read, and revoke capabilities are distinct; PostgreSQL stores only SHA-256 hashes. Item bodies stream directly to immutable Blob files with bounded item/transfer sizes. Finalize freezes the manifest, while expiry/revocation makes it unreadable immediately and the background GC removes Blob files before metadata. Management requires the revoke capability. Manifest reads hash and aggregate a stable receiver key; associate an account only after independently validating an optional Colab session, and never expose raw receiver identifiers.

Readable Channel and Shared Item names are selectors, not unique database identities. Do not reject valid product names merely to simplify Agent routing. Local Core scopes resources by active account, active Organization and authorization; Browser narrows candidates using the complete descendant path and returns metadata plus precise UUID refs only when ambiguity remains.

Shared Item list/read responses own remote attribution metadata used by both GUI and cached consumption: contributor display name, avatar, authoritative `updatedAt`, ownership capability and current root. Local Core may cache these values but must not invent empty timestamps or derive user identity from local paths.

Session blobs are opaque source JSONL segments. `session_snapshots` is an append-only manifest chain guarded by compare-and-swap on `current_snapshot_id`; `source_cursor` is contributor metadata, not a consumer page cursor. The Server authorizes and orders segments but must not import provider adapters or create normalized `session_messages` rows.

Deployment must be reproducible from checked-in scripts: bootstrap prerequisites, build or accept an immutable artifact, install configuration outside the checkout, migrate, atomically activate, restart, and verify readiness. Hostnames, SSH targets, passwords, OAuth secrets, and provider tokens belong only in ignored configuration.

PostgreSQL rows and Blob Store objects form one logical dataset. During alpha, test data may be discarded and deployment does not promise historical-data migration. When compatibility becomes a product requirement, backup, migration, and disaster recovery must move and verify both; readiness alone will not prove that existing Shared Item revisions remain consumable.

Do not report deployment success until the public or explicitly configured readiness endpoint passes and the activated version is recorded.

Channel Messages and Agent runtime commands are separate protocols. PostgreSQL and the Rust Server
remain authoritative for complete rich-text messages, structured mentions, registered
member/device/provider runtimes, blueprint policy, reply-chain context and Agent-authored replies.
After committing a message, Server routes every distinct Agent mention, packages the full task and
sends an executable command through that exact runtime's authenticated WebSocket. A protocol 2
runtime must ACK the request id on the same socket after parsing the complete command; otherwise
release the claim for reconnect delivery. After ACK, keep that socket present and do not claim a
second command until Local Core reports `agent.command.ready` after provider execution and its
durable completion/failure receipt. Runtime presence is connection-counted so stale socket teardown
cannot mark a replacement connection offline. Preserve the explicit legacy handshake branch until all
published platforms carry protocol 2; silently requiring ACK from old clients creates duplicate
execution. Conversation

Persist runtime acceptance separately from claim: a claimed request is still `delivering` until the
protocol-2 client ACKs the exact command. Only accepted, non-terminal requests may project an Agent
working indicator. Publish request-state invalidations after acceptance and every terminal transition;
clients repair missed hints by rereading PostgreSQL-backed state.
WebSocket invalidations remain repairable by message `seq`; runtime commands are not chat events and
must not be fetched by Local Core through an HTTP long poll. Blueprints must reference an available
runtime owned by the same member. Request-scoped context/reply endpoints fix the target blueprint,
Channel and sender identity. An authenticated owner runtime may report execution failure, but
raw provider stderr must not become Channel content. Public request creation only supports explicit
message forwarding; clients may not forge the mention-trigger path. Claims record a conservative recovery time
and capped attempt count; migrations must treat legacy `running` rows with no claim timestamp as
abandoned. Do not claim full lease hard-kill coverage until the timed restart test passes.

Canvas belongs to the same Colab Server and Channel authorization model. Store opaque Yjs-v1 updates
as an append-only per-canvas sequence and deduplicate by `(canvas_id, client_update_id)`; projection
and Tiptap schema logic do not belong in Server. A committed update emits only a small
`canvas.invalidated` frame on the existing account Conversation socket. Clients repair from the
PostgreSQL sequence over HTTP, so a missing or duplicated WebSocket frame cannot lose content. Do not
create a second Canvas socket or treat broadcast delivery as a durable ACK.
Canvas folders belong to the Channel authorization boundary; validate every parent and document folder
against that same Channel. A future Canvas Agent mention reuses the Messages blueprint policy/runtime
delivery machinery, but Server must derive its command context from the authoritative enclosing Heading
section and keep invocation state outside the CRDT document.
