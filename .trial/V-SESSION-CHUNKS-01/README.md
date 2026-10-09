# Session independent compressed chunks — 2026-10-09

## Production Reader implementation measurement

`reader-production-index.json` records a release-mode, read-only run of the actual
Core locator/page implementation, not the mechanically extracted experiment.
Initial 1.75 GB index took 9.974 s; extending it to a frozen 1.79 GB source took
217 ms. Recent five turns read in 4 ms with 322,178 selected record bytes and exact
equality to the frozen full projector. The index bundle was 3,334,183 bytes before
Zstd. No complete reconstructed transcript was created. This single warm-I/O run
does not measure network latency or RSS. The source grows during this chat;
freeze both implementation and reference to the same extent before comparing.

Reproduce using `COLAB_TRIAL_SESSION=/absolute/path/to/native.jsonl` and optional
`COLAB_TRIAL_BASE_EXTENT=1752630485`, then `cargo test --release --manifest-path
local/Cargo.toml -p colab-local-api native_large_index_measurement --lib --
--ignored --nocapture`. Only metadata is printed. Base extent must end at a
complete record boundary in that source generation.

## Question and scope

Verify whether independently compressed JSONL chunks are worth adopting and preserve the
existing normalized Session tool representation. This is an isolated local experiment, not
a deployed protocol implementation or a network/GUI acceptance test. Native source is read
only. No transcript text is printed or stored in reports. Generated Rust mechanically copies
current production Codex projection functions; do not treat it as maintained product code.

## Reproduction

Requirements: Python 3, zstd CLI, Cargo with cached serde_json dependencies.

```sh
python3 .trial/V-SESSION-CHUNKS-01/verify.py /absolute/path/to/session.jsonl
python3 .trial/V-SESSION-CHUNKS-01/projector_probe.py /absolute/path/to/session.jsonl
python3 .trial/V-SESSION-CHUNKS-01/edge_probe.py /absolute/path/to/session.jsonl
```

Source extent is frozen before reading; unfinished last records are excluded until complete.
Chunks end on complete JSONL records, targeting 8 MiB. Each algorithm compresses and
decompresses every block; exact bytes are compared. Every persisted byte range is reopened
and hash checked. Aggregate restored SHA matches input SHA. Reports contain metadata only.

## Actual observations

Real growing Codex source: frozen extent **1,752,630,485 bytes**, 55,440 valid records,
101 chunks, no incomplete tail or invalid records in this extent.

| Codec | Compressed bytes | Reduction | Compression seconds | Decompression seconds |
|---|---:|---:|---:|---:|
| Zstd 1 | 1,025,173,943 | 41.51% | 14.123 | 8.914 |
| Zstd 3 | 906,671,030 | 48.27% | 15.036 | 8.080 |
| Gzip 1 | 1,031,892,016 | 41.12% | 25.808 | 4.791 |

Single local run, not percentiles. Zstd times include one CLI process per block and pipe
copies; gzip runs in Python, so implementation overhead differs. Real Rust library timings,
disk persistence, CPU contention and network throughput remain unmeasured. Full experiment
wall time 84.443 seconds includes all three codecs, JSON validity checking, reopening ranges,
hashing and equality checks. Input I/O is not included in individual compression times.

Maximum record 18,421,203 bytes; maximum chunk 26,420,810 bytes. No record exceeded
production's 32 MiB limit. An 8 MiB target is NOT a hard maximum when whole records are kept.
Average Zstd-3 compression/decompression per actual chunk: 149/80 ms; not worst-case latency.

All codec roundtrips and all 101 reopened cursor ranges pass. Synthetic Unicode, incomplete
tail completion, repeated byte range/hash and truncated compressed payload rejection pass.
These are local cursor/replay checks, not a real HTTP lost-ACK/idempotency test. Rewrite and
replacement detection require explicit source generation identity beyond a byte offset.

## Structured compatibility

Mechanically extracted production project_codex + helpers are compiled in release mode.
First four real record-aligned chunks total 67,924,008 bytes / six projected turns.
With outputs both disabled and enabled, feeding lines across chunks with retained turns and
global record indices produces **exact Value equality** with the current whole-text parser.
Parsing blocks independently and concatenating results fails equality for both settings.
This confirms cross-block parser state is necessary (turns, deduplication, tool-result links,
stable record positions). All-source compression equality guarantees unchanged source bytes,
but all-source structural equivalence and Anthropic/MyFlicker adapters are NOT yet tested.
The probe retains all turns; bounded indexed state and random access still need implementation.
Existing GUI/Skill envelope can remain unchanged behind Local Core, but current tools do not
yet consume compressed blocks and have NOT been declared end-to-end compatible.

## Decision estimate

The initial Python/CLI comparison is not a codec selection. User approval is required after
the Rust full-source comparison. Zstd 3 saves 845,959,455 bytes in that initial trial.
At 10/100 Mbps payload bandwidth the saved wire time is ~677/~68 seconds,
versus ~23.1 seconds measured aggregate compress+decompress cost. A deliberately serial
estimate breaks even around 293 Mbps (~36.6 MB/s); pipeline overlap and cache reuse may improve
this, but network/CPU measurements are required. These are arithmetic estimates, not actual
transfer tests. Compression still leaves ~907 MB: it does not solve whole-file preview parsing.

Adoption should include immutable compressed chunk storage, paginated manifest, incremental
turn/dependency index, bounded cross-chunk decoder state, generation-aware sync cursor and
snapshot-pinned read cursor. Tail preview must not require all history; tool call/result edges
can require indexed earlier dependencies. Provider rewrites/rollback need adapter-specific
handling. Hash verification and compressed/uncompressed size ceilings must precede acceptance.
Server and recipient should not assemble a monolithic cache except for explicit export.

Next acceptance must cover actual Server/Core restart/retry, corrupt content, authorization,
old uncompressed segments, all provider adapters, tool dependencies crossing boundaries,
read-envelope equality and paging, peak RSS, cold/warm tail latency and real bandwidth. No
product/release code was changed by this trial.

## Rust full-source codec comparison (selection pending user decision)

Run `cargo run --release --manifest-path .trial/V-SESSION-CHUNKS-01/Cargo.toml
--bin codecs -- /absolute/path/to/session.jsonl
.trial/V-SESSION-CHUNKS-01/manifest.json
.trial/V-SESSION-CHUNKS-01/rust-codecs-full.json full` (one shell command).
Libraries: zstd 0.13, flate2 1, brotli 8; exact versions in Cargo.lock.
Same frozen 1,752,630,485 bytes and 101 record-aligned blocks for every codec.
One block is loaded, compressed and decoded at a time; every decoded block must equal
its raw bytes. No complete restored file is generated. No transcript data is reported.
MB below means decimal million bytes. Compression/decompression timings exclude source
disk reads and equality checks, include output allocation, and are single sequential runs
on this host, not repeated benchmark confidence intervals or network acceptance.
P95 is sorted sample index floor((n-1)*0.95). Actual blocks vary in size (see above).

| Codec | MB stored | Compression s | Decompression s | Block compression P95 s |
|---|---:|---:|---:|---:|
| Zstd 1 | 1025.23 | 3.53 | 2.11 | 0.076 |
| Zstd 3 | 907.20 | 10.23 | 2.52 | 0.144 |
| Zstd 6 | 835.56 | 26.51 | 2.96 | 0.388 |
| Zstd 9 | 752.71 | 41.61 | 3.35 | 0.623 |
| Zstd 12 | 742.05 | 86.03 | 4.14 | 1.274 |
| Zstd 15 | 740.65 | 281.37 | 4.51 | 3.865 |
| Gzip 6 | 986.36 | 37.30 | 6.47 | 0.533 |
| Gzip 9 | 986.06 | 41.13 | 6.41 | 0.641 |
| Brotli 6 | 809.09 | 95.55 | 7.13 | 1.321 |
| Brotli 9 | 742.28 | 437.79 | 7.09 | 6.477 |

All ten full-source exact roundtrip checks pass. Raw machine-readable results are in
rust-codecs-full.json. This verifies byte fidelity, not all-provider structural read adapter
compatibility (see Structured compatibility); product implementation is still pending.

Tradeoffs: Zstd 9 versus 3 saves 154.48 MB for 31.38 s extra compression; versus 6 saves
82.85 MB for 15.10 s extra. Zstd 12 versus 9 saves 10.66 MB for 44.43 s extra;
15 versus 9 saves 12.07 MB for 239.76 s extra. Thus 15 is 6.76x the compression time of
9 for only 1.60% smaller encoded data. Brotli 9 is larger and slower than Zstd 15 here.

At 10/100 Mbps effective payload bandwidth, the extra 154.48 MB saved by Zstd 9 versus 3
saves approximately 123.6/12.4 s of wire time. A strictly serial encode/transfer/decode
model breaks even at about 38.4 Mbps for that pair. Pipelining can overlap costs, but only
actual network measurement can determine the wall-clock winner. Once a block is cached,
there is no retransmission or recompression; consumer decodes only requested blocks.
Cold tail performance additionally depends on the index and dependency adapter, not codec
alone. This experiment does not implement that adapter or bound its memory.

Do not pick a default or start codec-dependent migration until the user weighs these results.
Zstd 3/6/9 represent useful different storage/CPU tradeoffs on this input; this is not a
universal conclusion for other transcripts or clients. Existing product artifacts are untouched.
