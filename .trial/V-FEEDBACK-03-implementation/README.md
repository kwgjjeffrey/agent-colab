# Feedback implementation acceptance — 2026-10-10

Implemented Codex/macOS hook delivery, managed installation identity mapping, bounded turn capture plus three prior human queries, independent Core upload/analysis jobs, private Server evidence and Markdown indexes, producer commands, and the Skill preview feedback entry.

Verified:

- Desktop-bundled Codex `0.162.0-alpha.2` returns a Markdown evaluation using ephemeral execution with hooks, shell and multi-agent disabled: zero new `threads` rows and zero rollout files. `desktop-ephemeral.py` uses only synthetic material.
- Core tests cover opt-in refusal, disabled hook without transcript access, native managed reads with asset/Channel/version, three prior queries excluding host injection, frozen extent, and comment arrival during an active upload.
- Isolated Postgres tests cover owner scope, reporter identity, timezone-aware filters, zero-feedback assets, Markdown/YAML indexing, immutable identities, pagination and atomic revision conflicts.
- GUI tests cover the counted entry, YAML plus free Markdown rendering, original Session preview, and failure without false zero counts.
- Trace Run `20261010T024724Z-ba31f69e`: one feedback transport case passed with 12 assertions. Real isolated Core/Server verify raw upload with analysis disabled, Markdown comment upload, negative-tag filtering, producer lists, existing Session Reader, ignore status, outsider denial and corrupted evidence rejection. The case was reviewed and qualified active. This transport fixture starts from pre-captured synthetic evidence; hook selection/capture is separately tested.
- Skill CLI/parser coverage and installed-tree entrypoints pass; Trace registry check passes.
- Candidate artifacts: Core `0.1.110-dev`, GUI `0.1.161-dev`, Skill `0.1.64-dev`. Skill package includes both prompt templates, module instructions and hook command. Electron Shell is unchanged.

No actual user conversation was uploaded. No global production hook was installed or trusted by these tests. Server deployment and installed production-hook acceptance are separate release steps. Earlier actual Desktop PostToolUse/Stop evidence remains in V-FEEDBACK-02.

Reproduction:

```sh
cargo build --manifest-path server/standalone/Cargo.toml -p colab-server
cargo build --manifest-path local/Cargo.toml
python3 .trial/V-FEEDBACK-03-implementation/transport-e2e.py
python3 .trial/V-FEEDBACK-03-implementation/desktop-ephemeral.py
```

The transport script requires local PostgreSQL tools, creates disposable loopback services and cleans up them and their files. The ephemeral test uses the user's Codex model quota with synthetic input. Raw logs/results are ignored.


## Deployed acceptance — 2026-10-10

Server `0.1.13` was built from isolated commit `5dae57a8ab50a1aee8001e67d1148a0adfe662f0` and activated through the checked-in deployment script. Migration 0046 and readiness succeeded. Client artifacts were published with the canonical R2 publisher, public size/SHA verification and signed manifest; Core `0.1.110-dev`, Skill `0.1.64-dev`, GUI `0.1.165-dev` (promotion `0.1.218-dev`), Electron Shell unchanged.

The actual Desktop-bundled Codex binary executed a dedicated four-turn synthetic test with invocation-scoped, explicitly vetted PostToolUse/Stop hooks (`--dangerously-bypass-hook-trust` limited to that test invocation). The test did not install global hooks or modify persisted hook trust. Native reads of the installed shared regression Skill and Colab itself produced two feedbacks with nonempty asset/Channel attribution, complete visible task evidence and exactly three earlier human queries. Core launched two ephemeral analyses, uploaded both Markdown comments, and created zero new analysis thread rows. Existing Session Reader returned all four query markers and the final task. Producer query and revision-checked ignored status succeeded. Test parent chat was archived and capture settings restored to disabled. Current Desktop GUI user-trust flow is still distinct from this invocation-scoped hook acceptance; it was proven by V-FEEDBACK-02, not bypassed globally here.

A concurrent GUI-only release lacked the Feedback module; final GUI 0.1.165-dev includes both workspace changes. Installed GUI 0.1.165-dev acceptance passed through CUA: counted entry, real feedback list, positive/ignored state, full YAML plus free Markdown, and original query/tool/final reply preview. No real user conversation was uploaded.

Parallel deployment replaced Server 0.1.13 with an older-migration binary at the same release path, causing a brief 502/startup failure. Restored the validated binary under a unique recovery release. Added and verified the canonical deployment guard: conflicting bytes at an existing version return exit 2 before upload/restart; new final artifacts use atomic no-clobber linking. Final integrated Server 0.1.14 is built from 47c8745777392449081da4eee304785d6a1889fe and retains current committed member/mention changes. Final activation/readback is recorded after completion.
