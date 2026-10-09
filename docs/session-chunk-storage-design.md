# Session compressed chunk storage

Status: implementation in progress, not deployed. User selected Zstd level 3 on
2026-10-09 after the full Rust comparison in `.trial/V-SESSION-CHUNKS-01/README.md`.

Foundation implemented: Server `blob_store.rs` wraps standard object_store S3
with bounded upload staging and private namespace GC; disk preserves its old
layout. Core `session_chunks.rs` verifies independently compressed frames and
provides a lazy seekable byte view holding one decoded block. Existing production
Session read/write paths still use the legacy raw protocol until negotiation,
provider indexes and compatibility acceptance are complete. This is not a
compressed Session release. Live test evidence is in `validation-plan.md`.

## Boundaries and compatibility

Core owns source scanning, record-aligned chunking, compression and provider read
adapters. Server owns authenticated manifests, immutable blobs, CAS and retention.
GUI and Python Skill keep the existing Reader envelope and never access S3.
Each owned source remains one asset across all Channel placements; authorization
still uses the requested Channel reference. Preview cannot trigger or cancel upload.

Disk remains the default Blob backend, preserving existing keys and layout. An
explicit S3 backend uses the standard object_store client, private bucket and
deployment-owned prefix. Secrets/endpoints stay in environment or ignored config.
Backend switching is not automatic migration: existing blobs must be copied and
verified before changing the serving backend. No production data deletion is part
of this change. Files, Skills, Sessions and Quick Share use the same Blob port.

## Wire and storage

New negotiated Session chunks are independently decodable Zstd-3 frames. Preserve
complete JSONL records with an 8 MiB target and existing 32 MiB record ceiling;
the target is not a strict block maximum. Metadata distinguishes codec, encoded
size/hash and decoded size/hash. Source byte offsets always refer to decoded
original bytes, never compressed bytes. Missing codec means legacy identity.
Only verified durable blobs become manifest entries. Partial data is not preview.
Lost acknowledgements recover only matching parent, range, codec and digests.

Server validates transport bounds and hashes, commits through existing snapshot
CAS, and stores frames unchanged, without rebuilding a transcript. Compression
bombs and decoder window sizes must be bounded before reading. Old raw chunks
remain readable; do not silently rewrite committed history.

## Reading without whole-file reconstruction

Core caches immutable frames by account/asset/content identity, plus snapshot
manifests and a rebuildable provider boundary/dependency index. It decodes only
blocks required by the requested page. No concatenated snapshot JSONL is written.
Reader cursors pin revision and adapter position. Cross-block turn, adjacent
mirror deduplication, tool-result links and provider rollback are adapter state,
not independent per-block parsing. Output trimming happens after projection.
Contributor reads use frozen native extents and independent indexing, not the
publication cursor or synchronization mutex. Source replacement/rewrite needs
generation detection beyond file length. Legacy cold indexing can scan once but
must remain bounded and never persist a reconstructed full file.

## Implementation and acceptance gates

1. Preserve a Git rollback point; record approved codec and measured evidence.
2. Implement bounded codec verification and disk/S3 Blob port with fault tests.
3. Extend manifest/wire contract non-destructively; negotiate before publishing.
4. Replace whole-file materialization with provider-aware chunk read adapters.
5. Verify all providers, cross-block tool dependencies, pinned paging, restart,
   lost ACK, digest corruption, authorization and cross-Channel deduplication.
6. Measure cold/warm latest-page latency, downloaded bytes and peak memory on the
   real 1.75 GB source; test S3 against a real compatible service, not just mocks.
7. Update live validation/release evidence. Build only changed Core/Server units;
   no release before the complete read/write compatibility path passes.

Compression byte fidelity is already verified for all ten full-source candidates.
Stateful projection equivalence currently covers only four real Codex blocks;
it does not establish full adapter or end-to-end compatibility. Native Windows,
S3 integration, production migration and release remain unverified.
