# Server deployment

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

Quick Share is implemented by `quick_transfers` / `quick_transfer_items` and the isolated API/persistence modules named `transfers.rs`. It is not a temporary Channel and never creates Organization membership. Upload, read, and revoke capabilities are distinct; PostgreSQL stores only SHA-256 hashes. Item bodies stream directly to immutable Blob files with bounded item/transfer sizes. Finalize freezes the manifest, while expiry/revocation makes it unreadable immediately and the background GC removes Blob files before metadata.

Readable Channel and Shared Item names are selectors, not unique database identities. Do not reject valid product names merely to simplify Agent routing. Local Core scopes resources by active account, active Organization and authorization; Browser narrows candidates using the complete descendant path and returns metadata plus precise UUID refs only when ambiguity remains.

Shared Item list/read responses own remote attribution metadata used by both GUI and cached consumption: contributor display name, avatar, authoritative `updatedAt`, ownership capability and current root. Local Core may cache these values but must not invent empty timestamps or derive user identity from local paths.

Session blobs are opaque source JSONL segments. `session_snapshots` is an append-only manifest chain guarded by compare-and-swap on `current_snapshot_id`; `source_cursor` is contributor metadata, not a consumer page cursor. The Server authorizes and orders segments but must not import provider adapters or create normalized `session_messages` rows.

Deployment must be reproducible from checked-in scripts: bootstrap prerequisites, build or accept an immutable artifact, install configuration outside the checkout, migrate, atomically activate, restart, and verify readiness. Hostnames, SSH targets, passwords, OAuth secrets, and provider tokens belong only in ignored configuration.

PostgreSQL rows and Blob Store objects form one logical dataset. During alpha, test data may be discarded and deployment does not promise historical-data migration. When compatibility becomes a product requirement, backup, migration, and disaster recovery must move and verify both; readiness alone will not prove that existing Shared Item revisions remain consumable.

Do not report deployment success until the public or explicitly configured readiness endpoint passes and the activated version is recorded.
