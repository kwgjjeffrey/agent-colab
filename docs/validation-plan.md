# 技术验证计划

### 2026-10-10 Private chunk storage rollout — verified

After public stable213 acceptance, the isolated integration completed real Rust
20MiB multipart exact readback, frozen historical migration and independent
Server/Core release. Initial 10 historical objects/51,808,828 bytes were copied
and fully hash-verified; final recutover verified 28 objects/51,871,933 bytes,
including owned acceptance objects/new writes. Original files and database backups
remain intact. Scope guard tests passed4; no unrelated namespace access occurred.

Actual installed Core publishes a >20MiB owned Session into two Zstd3 frames.
An isolated authorized consumer downloads only one selected frame, does not
reconstruct JSONL, reads exact recent turns after restart, and reads two existing
historical Sessions. Installed Skill also reads the new Session correctly. Same
functional path passed on compatible disk rollback, then restored S3. Rollback
hydration independently downloaded/hash-verified24 SQL-referenced objects before
activating disk. Final S3 deployment disables permanent new-write disk mirrors;
source retention and disabled remote GC are intentional rollback/safety boundaries.

Independent enterprise candidate installed, authenticated and promoted after
acceptance; public App/service hashes remained unchanged. Detailed versions,
provider evidence and private Git checkpoints belong to ignored integration docs.
No production enterprise endpoint, native Windows, company notarization, remote
DELETE or general garbage collection acceptance is claimed.

### 2026-10-10 Chunk release candidate — verified

Actual packaged Core 0.1.106-dev with GUI 0.1.157-dev and deployed Server 0.1.11:
cross-Channel Round `20261009T160641Z-de5033ff` passed 125 assertions; independent
preview Round `20261009T160833Z-48b7963b` passed 30. The latter injects 35 seconds
inside actual upload bodies independent of compression ratio. GUI local preview
survives failed publication, off-preview sync completes, receiver gets the tail,
and local pinned paging survives. Screenshot and exact owned cleanup reviewed.
Earlier transport/cleanup-timeout failure remains in the same cross-Channel Run.

Actual packaged Core 103 vs106 compatibility Round `20261009T161241Z-d59c20cf`
passed20 assertions: new receiver reads raw publication; old receiver reads new
compressed publication via default raw Server compatibility; structured turns
and content agree. Receiver restored in finally. Isolated HTTP test also passes
Zstd→identity→Zstd append history, with exact raw/encoded size and SHA-256.
Historical byte rewrite is unnecessary.

Four publisher guard tests passed: numeric ordering, stale promotion rejection,
local mutual exclusion and unreadable stable fail-closed. Final stable readback
guards the retained artifact set, but is not cross-host atomic CAS. Core archive:
`dd44dde84a9ff7c95f7501f90ea7078ba6aaaac2b725e743dd027b0dadb3f0ac`.
Server11 deployed binary:
`8d84f51b0b2618e2f0d6a5cb27d948d1ef923618793e0c45691771802b7036ae`.
Public stable213 already promoted Core107 (Session implementation identical to106).
Full curl/parallel-range readback verified 45,569,542 bytes and SHA-256
`ca89811f2d2a6d21481192092b005faf544bd351aa397c646d8a73dc125c6743`.
Actual packaged Core107/GUI159 compressed-sharing repair Round
`20261009T161703Z-c967abac` passed16 assertions against the public Server.
Normal `/v1/system/installation?refresh=true` reports latest Core107, GUI159,
Skill62 and unchanged Shell23, with an actual update proposal. No daily installation
was replaced by this task. Native Windows is not claimed.

### 2026-10-09 Compressed Session read/write acceptance

Core frame tests: 4 passed. Session API/index/receiver tests: 16 passed, two
explicit native-data tests ignored in routine runs. Server routine tests: 14
passed; isolated PostgreSQL shared-publication/index permission test and actual
HTTP upload/download/index retry test both passed. Real R2 S3 port uploaded a
20,972,009-byte independently compressed synthetic frame through multipart,
read back exact bytes/SHA-256, removed staging and deleted only its owned object.
No production storage configuration changed.

Release-mode read-only native measurement froze 1,786,504,615 bytes. Initial
1,752,630,485-byte locator build: 9,974 ms; incrementally extending that index:
217 ms; recent five turns: 4 ms / 322,178 selected record bytes. Locator bundle
3,334,183 bytes before compression. Frozen full projection comparison: exact
structured equality, 1,072 ms. Single-host warm-I/O observations, not network
latency or confidence intervals. No reconstructed transcript was persisted.

Trace contract Run `20261009T141937Z-3f2d8095`: one selected case passed all six
assertions, executing actual 4 Core frame, 16 Session and 4 streamed-upload tests.
No provider performance budget claimed. Cross-channel E2E assertions were
adapted from reading a full raw cache to Reader structured equality, and returned
to trial pending candidate execution. Production deployment, installed GUI and
native Windows acceptance remain pending.

### 2026-10-09 Rust codec comparison — verified, product migration pending

`.trial/V-SESSION-CHUNKS-01/rust-codecs-full.json`: same frozen 1,752,630,485 bytes,
101 record-aligned chunks; Zstd 1/3/6/9/12/15, Gzip 6/9 and Brotli 6/9 all exact
roundtrip checks passed. Zstd 3: 907,195,781 encoded bytes, 10.234 s compression,
2.525 s decompression, block compression P95 0.144 s, on this host in one run.
User approved level 3. Results do not prove read-adapter/provider compatibility,
S3 integration, network throughput or GUI/release acceptance; those remain pending.

Foundation acceptance: `cargo test --manifest-path local/Cargo.toml -p
colab-local-core` passed 4 tests (exact Zstd/identity bytes, corruption/truncation/
multiple-frame/false-size rejection, tail-only lazy loading and cross-block seeks,
failed load position). `cargo test --manifest-path server/standalone/Cargo.toml
-p colab-server` passed all 13 unit tests, including 3 storage-port cases (disk
layout, 10 MiB multipart-like buffered object roundtrip, GC reference/grace/path
isolation). Remote-port tests use object_store InMemory, NOT real S3 acceptance.
Server and Local API compile checks pass; Local API retains an unrelated existing
dead-code warning for proxy_json. `git diff --check` passed. Docker daemon was
unavailable locally, so no MinIO/R2 integration or migration is claimed. No
component version advanced, production backend switched, or artifact released.

### 2026-10-09 Source-owned assets — released and daily App accepted

Checkpoint `aa3efdd`; implementation `dc26762` / `94486af`, populated migration
repair `c356dca`. Isolated PostgreSQL checks pass projection, global legacy rename,
B-only authorization, outsider denial, shared Files/Skill/Session publication,
concurrent registration, old IDs (including duplicate same-Channel placements),
independent withdrawal, 24-hour retention and expiry/re-share. Core 102: 32 unit tests
pass, one native-machine test explicitly ignored; Server: 10 API tests pass.
Packaged Core 101 Trace case `context.assets.cross-channel` passed 124 assertions
in Run `20261009T080837Z-c94ad994`, Round `20261009T091734Z-1cd6014b`: concurrent
A/B consumer reads use one cache, exact initial and updated bytes match, scope is
preserved, and B continues after A withdrawal. Script/cleanup reviewed and case
qualified active; prior failed rounds remain. Registry check passes 142 operations;
binding audit passes GUI 94/Core 149/Server 88; CLI parser audit passes 48 commands.
These static checks do not claim cloud trace delivery or a performance budget.

Consistent pre-migration backup: `/var/backups/agent-colab/before-source-assets-20261009T0845`.
Server 7 rollout failed on populated deferred FK queues, rolled back without schema
changes, then fixed Server 8 passed production-backup rehearsal (127 old IDs) and
deployed migration 42. Running Server binary SHA-256:
`8438e20c90f1df0f33e2da7b336ea104b8cb033bb523ab35f33292fb87905106`.
Authenticated historical Session readback retained 84 segments; latest segment
8,408,841 bytes passed exact size/digest verification. Contributor preview still
reads its local source independently. This does not claim the entire 1.7 GB upload
is complete; the pre-update uploader reported a retryable snapshot conflict.
Promotion 203 public Core archive: 45,111,561 bytes, SHA-256
`37f10613a8c45c830d7326cbc3f731a647ffb3e208e95c35c92a2c715ec7cf0b`.
Only macOS Core changed; Windows/GUI/Skill/Shell retained. Daily App normal update
to Core 101 passed: active executable SHA-256
`ec672ccadd7672238ed2190f6aa5e027dbc26b5c3fe2d9c88e1e5df5c0f162de`,
PID 7822, 26 asset reference mappings and independent local preview confirmed.
Follow-up Core 102 source `c1fbbf9` was isolated from concurrent enterprise drafts.
Its packaged cross-Channel Round `20261009T094007Z-18f68241` passed 126 assertions.
Lost-ack boundary tests reject mismatched parent/offset/digest/size/snapshot linkage.
Core 102 archive: 45,118,589 bytes, SHA-256
`4847e9b1439e1501ca561816fd4d86a9bd0857598694dfafff18076d5f2ac7f2`;
Promotion 204 public integrity verification and normal daily App update passed.
PID 37516 runs Core 102; executable SHA-256
`4ab96461149ced8eea3872b8f0436575516614c7d4ff066d1191858e052336ed`.
The actual large Session cursor advanced from 1,482,637,821 to 1,491,046,662 bytes,
matching the previously accepted lost-ack segment, then continued new publication
to 1,522,105,857 bytes. State is syncing with no error;
whole-source completion is not claimed. Case-owned references in both isolated
Channels are all inactive; three isolated test processes stopped, records retained.
No user local source, unrelated draft, or production backup was deleted.

### 2026-10-09 Session preview / synchronization separation

Server 0.1.5 deployed through the canonical Linux build/deploy scripts; readiness passes. Its streaming receive tests cover multi-frame digest/bytes, size/digest rejection, interrupted streams, idle expiry and partial-file cleanup (3 tests). Core 100 Session tests pass (9); GUI suite passes (124 across 45 files), with focused independent failed-sync status/readable-content tests passing after the final wording change. Production GUI 145 and Core 100 builds pass.

Run `20261009T060217Z-7f0f33de`, final Round `20261009T060810Z-d0b8d152`, passes all 27 assertions: real owned 16 MiB transcript, publication-only failure with usable GUI preview, zero falsely accepted bytes, throttled multi-segment upload lasting over 100 seconds, navigation away during upload, read during upload, full accepted-byte equality, exact final marker on a second device, distinct published/local snapshot identities and stable old local cursor. Earlier rounds preserve the test bridge's 15-second waits for upload/initial receiver download; explicit operation waits repair the script without changing product deadlines. Fixture shares and source directories are withdrawn/removed, transport restored. This is same-owner cross-device evidence, not distinct-member or the user's specific 161 MiB Session acceptance.

Packaged GUI 145/Core 100 Round `20261009T061214Z-81f987e3` passes three cases / 52 assertions: real CLI revision-pinned pagination (16), Session/Message tail, typed tools, manual scrolling, older-page anchor and sidebar resizing (24), and receiver-created remote share / offline committed-cache reading (12). Cache case now explicitly exercises a consumer device, not a contributor local source; both reviewed cases are active. No full repository regression or invented performance budget is claimed. Exact trace IDs were retained, but the isolated fixture's provider ingestion returned unavailable; functional results do not claim provider timing or trace-child assertions.

Promotion 197 published Core 100 / GUI 145 with exact public size/hash verification: Core 44,985,147 bytes, SHA-256 `ebfe45a779016f8c3d70b93b89cefe611aca7b822674ea7bf03b25757a207c14`; GUI 2,445,153 bytes, SHA-256 `034b07b83bbd60e9354784155ec524cbb77dae33a5018742a6e829a14ba3f82b`. Normal daily App update and managed restart succeeded; new PID 4716 and authenticated ui.json confirm GUI 145, installed Core 100. Shell 23 and Skill 57 unchanged, Windows Core 62 retained.

The actual reported Session `c035918e-34f7-4409-b902-17c14de643ca` has since grown to approximately 1.7 GB. Running Core 100 returned one recent turn from its independent local preview in approximately 5 seconds, no decoding warnings. Background accepted-byte progress advanced from 969,463,992 to 985,540,925 while total source continued growing; upload remains in progress, not claimed complete. No content was copied to another Channel during this check.

### 2026-10-09 Catalog counts and uploader identity

Server catalog children/trails now return nullable childCount and contributorMemberId/contributorName/contributorAvatarUrl. Counts include only direct Catalogs, non-archived Canvas and active shares; existing parent indexes support the counts and stable IDs/placement remain unchanged. GUI shows counts even when collapsed (including zero), and Files/Session/Skill uploader avatars open the existing UserIdentity profile without changing selection. Added sidebar right padding after real pointer acceptance found the scrollbar intercepting the Skill avatar.

Server 0.1.4 production build/deployment/readiness passed. GUI 0.1.139-dev / promotion 0.1.191-dev published and normally installed; actual ui.json verified. TypeScript/build passed. Public readback verified 1319883 bytes / SHA-256 `aeca5e8c1bc94d24cab5a788c8aa818f0f167a38c790858b0509f12654172ee8`. Core, Skill and Electron were not rebuilt. Round 3 `20261009T042902Z-c7350753` in Run `20261009T042513Z-c3ff7f2b` passed all 23 assertions: direct versus recursive count, collapsed label, all three uploader identities/profiles, selection preservation and owned cleanup. Four screenshots reviewed. Earlier selector-animation and scrollbar failures remain recorded. Case qualified active; temporary daily-client index removed. No full-suite acceptance is claimed.


### 2026-10-09 Recover Catalog read errors

Native OKR editor was mounted and Synced while Catalog displayed a stale Failed to fetch. Catalog read errors are now separate from mutation errors; successful background refresh clears only read errors. The initiating historical transport interruption is not established by retained logs. GUI 0.1.134-dev / promotion 0.1.186-dev published and normally installed; actual ui.json verified. Production build passed and public readback verified 2439669 bytes / SHA-256 `3ec58f2668c9ed66c4b619695eb8481c3092dae447badd46f9775747723d1370`. E2E `20261009T033459Z-e3887140` passed three assertions using actual background request abort and recovery without reload. Test used a temporary index aligned to daily GUI/Core, and did not mutate Channel data. Extra owner/receiver/revocable/Trace runtimes are isolated test-installation registrations retained under the user account, not a required same-machine multi-Core product feature or an authentication bypass.

### 2026-10-09 Channel icon Agent handoff — verified and published

GUI suite passes (120 across 43 files), including 3 focused prompt/form tests. Python suite passes (47),
covering bounded raster encoding, unsafe/missing paths, preserved name, confirmed
compact receipt and argument exclusivity. Production TypeScript/Vite build passed.
`channels.icon-agent` is now active: Round 20261009T034014Z-23f572c9 on actual
GUI 135/Core 99 executes the displayed packaged Skill 57 command against a real
owned Channel, verifies byte digest, preserved name, GUI decode/reload, external
form reconciliation and restoration (23 assertions). Retained manual upload and
library generator pass workspace Round 20261009T033717Z-7a5a64e0 (20 assertions),
also reviewed/active. Run 20261009T033140Z-432473f0 preserves the missing-refresh
defect, obsolete Core 94 fixture, shared-browser contention and default case
timeout evidence; the final bounded run uses its own profile and 180s operational
timeout, not a performance budget. No model image generation or full Agent
execution is claimed by this upload regression.

Promotion 187 publishes GUI 135 (1,317,866 bytes, SHA-256
1db18174d208c56d6681c5e122a2335ee4372693fddf94449f5fd6c0b25d6961)
and Skill 57 (1,728,817 bytes, SHA-256
7d3126661af16827cdab18e2d398ae11c75351404a7e7746da08331b83234fa5).
Canonical publisher verifies public immutable bytes and signed stable readback;
Core/Server/Shell stay unchanged. Daily installation is not claimed.

### 2026-10-09 Direct Canvas creation

Canvas creation entrances now commit an Untitled document immediately, select its workspace identity, then focus and fully select the sidebar name after creation finishes. Native rename uses a transparent surface and subtle focus border. GUI 0.1.132-dev / promotion 0.1.184-dev published and normally installed; actual GUI metadata matches 132. TypeScript/build and public artifact readback passed (1317287 bytes; SHA-256 `b875a522dbb9040ff01fe4df963a13b11ba37c95633e6788a52d48eb2110dec7`). E2E `20261009T030939Z-401d5947` passed all eight assertions: no dialog, selected focused name, real rename with stable ID, reload persistence and owned archive; screenshot reviewed. Earlier failures `20261009T030455Z-9c8aa6d2` and `20261009T030709Z-4f035407` are preserved: candidate proxy served old GUI 129. Final scope uses an isolated temporary index pointing to daily GUI/Core with aligned actor, leaving the other task candidate unchanged.

### 2026-10-09 Account avatar — verified and published

117 GUI tests / 42 files and production build pass. Includes avatar upload/reset
contract and deterministic eight-colour fallback contrast >= 4.5:1 against white.
Server avatar envelope validation test and cargo check pass. These do not prove
durable GUI-to-Server behavior. The isolated PostgreSQL test passes customized
photo preservation during Google linking/login and explicit initials preservation
against a later provider photo. No live OAuth consent is simulated.

Run 20261009T030620Z-362f57b8 retains the non-restorable provider-avatar fixture
blocker and concurrent-browser profile blocker. Reviewed passing Round
20261009T031400Z-16ed1cc7 on GUI 132 / Core 99 / Server 0.1.3 proves actual PNG upload
through GUI, native 256px JPEG decode, durable profile and saved-account/session
projection, reload, rejected SVG/URL/oversize input with unchanged photo, initials
reset, exact palette membership/white text, and fixture restoration. Screenshots
were reviewed; identity.accounts.avatar is active. Compact one-initial versus
two-initial colour consistency has a separate passing unit assertion in GUI 133.

Canonical Server deployment activates 0.1.3 and passes readiness. Promotion 185
publishes GUI 133, 1,317,274 bytes, SHA-256
`2d14909e5f1c32dbf339f1f365351c23e17a0d1b10dc833818feb777cab0347b`,
with public exact size/hash verification. App /ui.json currently reports GUI 132;
installation of final 133 is left to the normal user update, not claimed here.

### 2026-10-09 Creation hints / sharing setup — verified and published

GUI 128 production build and 115 tests pass. Skill 56: 43 tests pass, including
Files exclusion forwarding and rejection on Skill, packaged entrypoints and CLI
registry coverage (48 leaf commands). Registry check: 142 operations valid. These
are not E2E claims. Case `gui.sharing.agent-setup` obtains real GUI prompts
and executes their arguments against isolated sources using the candidate package.
Run `20261009T022759Z-82283a05` preserves selector repairs and the discovered
Quick Share Tooltip/submenu hover conflict; the final repair is `b372345`.
Round `20261009T024436Z-3e56e1a2` passes real prompt commands, Catalog placement,
Files exclusions and exact separate-receiver bytes, existing scope GET/PATCH and
clear, Skill source discovery/publication, and owned fixture withdrawal/cleanup.
Only installed executable prefixes were replaced with candidate package paths;
the Skill source placeholder was explicitly selected from the isolated fixture.
No Agent LLM was launched. The reviewed case is active. The 300-second execution
window is not a performance budget; registry validation is not trace ingestion.

Promotion 180 publicly size/hash verifies GUI 128 (3,553,651 bytes; SHA-256
`20bad4274d8810b4c1983be6d5bb4bf153da2f7b39053cc6f78b76935e3dde3f`)
and Skill 56 (1,727,142 bytes; SHA-256
`859c4298f171c6803a129f0c47b920eaa61dbf02e149765b856b4b2ff260068b`).
Core 99 / Shell 23 / Server 0.1.2 remain unchanged. Native update was interrupted
by user interaction; installation is not yet confirmed.

### 2026-10-09 Immediate handoff Dialog — verified and released

Implementation `a71419c`; GUI 127 production type check/build and 112 GUI tests
pass. Component tests cover loading, preserved query and retry; these do not
prove backend behavior. Trace Run `20261009T015000Z-cf188d5c` passes
`gui.prompt.loading`: holds the real Canvas document / Files channel request,
asserts the Dialog and disabled delivery before releasing it, then continues
the actual response and checks assembled commands and preserved user query.
Closing before response completion does not reopen the Dialog. No fake response,
clipboard write or Agent launch is used. The reviewed case is active.

Promotion 179 publicly verifies GUI 127 (1,315,946 bytes; SHA-256
`dfc0634cbd5dd80d30cfd787e1bce4f69cbd02075d86b562dbbf51941fdb4b33`).
Core 99, Skill 55, Shell 23 and Server 0.1.2 are unchanged. Native Settings →
Check updates → Update completed; active `/ui.json` reports `0.1.127-dev`.
Native Canvas handoff visibly shows Preparing Agent prompt with disabled actions,
then actual document commands with enabled copy/forward/open actions. Dialog
closed after acceptance. This validates feedback ordering, not preparation latency.

### 2026-10-09 Primary Add entrance

Six CatalogWorkspace tests pass, including DOM order Add → Home, `bg-primary`
variant and opening the existing Catalog menu. GUI 126 production type check and
build pass. These component assertions are not backend/E2E coverage. Promotion
178 publicly verified GUI 126 (1,315,457 bytes; SHA-256
`d15fe5ccd1be18a3b2d9b287360a1467258290407066183f33dbcd55fad8d869`).
Normal native Check updates → Update installed it; `/ui.json` reports 126.
Native screenshot confirms filled primary Add above Home; clicking it retains
Catalog, Canvas, Session, Files, Skill and Quick Share entrances.

### 2026-10-09 Conversation tail/scroll and compact Channel — verified and released

Checkpoint `fd037f9`; implementation `4a6a372`. GUI type check, production build
and 109 tests passed. Core Session projection tests: 9 passed, including typed
tool envelopes and mirrored provider records. Server cargo check and Linux
release build passed; Server 0.1.2 deployed through the canonical script with
readiness verified. These compilation/component results are not E2E claims.

Trace Run `20261009T012334Z-0239217b`: four-asset detail/breadcrumb/primary-action
acceptance passed. Round 2 (`20261009T012607Z-bd839318`) passes the new long
conversation case: five recent turns, tool calls collapsed and not labelled as
User, initial tail position, manual scroll unchanged across two 3-second list
refreshes, older-page anchor, compact Channel heading inside sidebar and keyboard
resize. Actual Core → Server latest-three, before-cursor previous-three and
unchanged after-cursor results match exact message IDs. Owned Session withdrawn
in finally. The reviewed case is active. GUI 125/Core 99 candidate `/ui.json` and
running Core match; telemetry availability diagnostics remain in the records.
Promotion 177 published with full public size/SHA-256 readback for Core 99
(44,929,356 bytes, `0b258585db834ec55c7e7602201a1549b108d3f4c7e025ab50be9041a24b8505`)
and GUI 125 (1,315,453 bytes,
`313b5682b1b0c2f664a73e768082e9a0d269f9c447729ab0fe2ab43d8bef71ee`).
Native Settings → Check updates → Update completed without replacing the shell
manually. Active `/ui.json` reports 125. Native historical Codex Session opens
at recent conversation, shows tool buttons rather than User blocks, scrolls
upward normally, and retains the compact Channel heading/member entrance in
the resizable sidebar with the detail trail at the top of the right pane.

### 2026-10-09 Detail actions and IA regression migration — verified and released

GUI 123 / macOS Core 97 is published as promotion 175. GUI type check and 108 component
tests passed. Core Session projection tests (8) and Codex queue/capture tests (3)
passed, including retaining real failed-turn events. These are not E2E evidence.
Rollback checkpoint: `d752304`.

Real Trace runs preserve failures: `20261008T201940Z-b5d8b1fa` initially used
the daily 122 GUI accidentally; switched regression GUI to the dedicated owner
proxy 53482 and explicit owned discovery. `20261008T202344Z-f00da3a6` passed drag
and detail return, but its original detail assertion did not await Canvas正文.
`20261008T202900Z-8300866d` passed mixed Catalog CLI/GUI identity, nesting, move,
cycle/non-empty rejection, inline rename persistence and retained Channel controls.
`20261008T203125Z-ad9fc541` passed stricter four-asset detail acceptance: real
Canvas editor, Session text, SKILL.md, Files tree, filled primary handoff,
More-menu Move, breadcrumb return.
Run `20261008T204255Z-d6d75a03` passed four real cases: Canvas inline rename/body
persistence, actual file previews, missing-original-source Session snapshot
preview, and exact task request/work-event transcript after reload.
Run `20261008T205339Z-c3048d29` passed updated four-asset navigation (including
Channel click default Home) and interrupted-publication file Retry from More.
Canvas Move persisted correctly but receiver selection and cleanup exposed stale
test assumptions; repair rounds are retained. Broad IA migration and work-event
network retry remain pending; no full-suite/release claim.

Run `20261008T205848Z-27c8683e` passes seven migrated cases: Messages/Session
onboarding, welcome Canvas, Files sync scope/withdraw, Session registration and
Skill registration/withdraw. Workspace onboarding was excluded with an honest
"Case changed after planning" error, then passed in `20261008T210244Z-827e2fb2`,
along with Catalog workspace and strict detail return. Canvas Move receiver
selectors are being repaired separately, not counted green yet.

Dedicated owner tracing was disabled and is now explicitly enabled. Registry
check validates 133 operations. Actual backend traces
`bf6bc28cae1061451d4de9453435fc39` (workspace.mutate) and
`841a5f2a88b139ffa66ec0414f5fc8dc` (sessions.preview) both have successful GUI
roots with `result.state_committed` and causally parented Core/Server requests.
Removed 64 obsolete Tab locator entries; legacy standalone Canvas create/title/move
operations retain their IDs but are labeled legacy rather than presented as the
current mixed-workspace entry points. Bounded trace samples are not population SLOs.

Run `20261008T210700Z-8a535d20` passes task-event upload-outage recovery (56 real
assertions). Run `20261008T211846Z-8f53c5f0` passes Canvas More > Move, persistent
parent/identity, invalid-parent rejection and independently authenticated receiver
discovery after fixing its Core 93/GUI 122 mismatch. Original failures remain.

Release source `9001657`; clean component builds, canonical R2 publisher with
`--platform darwin`, full public size/hash verification and signed promotion 175.
Unchanged Shell/Skill and existing Windows Core are retained. Native normal
Check updates → Update succeeded: daily `/ui.json` is 123, discovery PID 79264's
executable resolves to `versions/local-core/0.1.97-dev/colabd`. Native verifies
Channel click Home, direct image preview/no duplicate file tree, primary/More,
actual formerly failing historical Session preview and Canvas正文/Synced footer.
An initial Canvas transient offline fallback recovered on reopen; it is not
represented as automatic retry acceptance.

Expanded Run `20261008T212046Z-9440bbae` passed Canvas text roundtrip, two-client
convergence, activity deep links, GUI navigation, message catch-up, Core restart
and Quick Share expiry. It found a genuine IA regression: offline directory
discovery did not reuse the existing account-scoped Core cache. Core 98 fixes
Catalog children/trail via that cache, retaining its permission-denial invalidation.
Repair Round `20261008T213053Z-c8eab8f0` passes Canvas offline edit → Core restart
→ GUI reopen → recovered durable synchronization (16 assertions), and three-kind
Quick Share snapshot isolation (72 assertions). The Skill-source helper now uses
an existing owned regression source rather than trying to overwrite a protected
locally modified installation.

Run `20261008T213729Z-cdc0b590` passes Channel creation but exposed an unauthenticated
receiver WebSocket: HTTP-only test routing did not provide Core's local cookie.
The helper now supplies the existing bootstrap-equivalent HttpOnly cookie; cases
sharing localhost browser auth declare an exclusive lock. Repair Round
`20261008T214642Z-833bd212` passes message send/second-client delivery, missed-message
catch-up and Canvas convergence. These earlier failures remain recorded.

Promotion 176 is publicly verified and installed via normal App updates (GUI 124,
macOS Core 98; Shell/Skill unchanged and Windows Core retained). Active daily GUI
reports 124; PID 42579 resolves `versions/local-core/0.1.98-dev/colabd`. Native old
task acceptance confirms the actual recorded description appears even when no
provider transcript exists. GUI type check and 109 component tests pass. The
asset/action changes use shadcn controls; no fabricated historical work is shown.

GUI case affectedPaths now include the shared workspace where relevant, so future
workspace changes select navigation-dependent cases. 28 reviewed cases have been
qualified through the managed runner; other cases retain their prior maturity.
This is scoped IA acceptance, not a claim that the full repository catalog ran.
Run `20261008T215107Z-4fd8fd7c` passes catalog drag, Catalog workspace and four-asset
preview/navigation again. New terminal-root gates for `workspace.mutate` and
`sessions.preview` pass using provider traces and the visible 30-second wait
boundary: single observed roots 472.30 ms and 1119.90 ms, respectively. These are
individual registered entrance-to-return samples, not population percentiles.
The already-active drag case also has fresh evidence; 29 distinct scoped cases
were verified across the retained runs and repairs.

### 2026-10-09 Actual asset previews — candidate validation

Trace Run `20261008T182031Z-7615ccd9` passed the scoped real Core/Server
four-asset preview and breadcrumb return case against packaged GUI 121/Core 96.
Eight focused GUI component tests and production build passed, including opaque
Session cursor continuation. Public GUI verification: 921358 bytes, SHA-256
`4cbfd961681aa7341676b38c53d6ff650d6a9c22fcb8833f34133cc6c41a5682`.
Promotion 173 retains Shell 23 and Skill 55. Normal daily App installation
completed; /ui.json reports 121 and lsof identifies the active Core 96 executable.
Native second Channel acceptance verified real SKILL.md, installation popover,
MyFlicker conversation with earlier-page entrance, Files internal trail/content,
and breadcrumb return to usable Add. No asset was installed, removed or changed.
The legacy damaged Session snapshot is not claimed repaired; its original bytes
remain unchanged. This is not a full regression-suite claim.

### 2026-10-09 Detail navigation repair

GUI 119 production build and four workspace component tests passed, including
nested Session returning to its Catalog. Trace Run `20261008T173113Z-1cf09b20`
preserves the initial script failure from ambiguous fixture names. Repair Round
`20261008T173257Z-7470a8a0` uses exact item IDs and passed six assertions against
real Core/Server fixtures: Files preview does not intercept directory navigation,
and Files/Session/Skill/Canvas each return to usable Add. This addresses the
regression missed by the original Catalog create/rename case. GUI-only promotion
171 is published with full public verification: 1735541 bytes, SHA-256
`ed7f09eaf317199c6360c6d592c014a9344c2344183e984d7d4c98f537d3f429`.
Core 95 / Skill 55 / Electron 23 remain unchanged. Normal App update installed
promotion 171; active `/ui.json` reports GUI 119. Native acceptance on the user's
existing second Channel proves Doc1.docx detail → Back → Add → same detail,
then direct Message selection from that preview. The directory and Channel
header remain reachable. No asset was modified or withdrawn.

### 2026-10-08 Catalog workspace — partial validation

Four Explorer contract tests passed: encoded path segments, invalid paths, nested
resolution/stable consumer identity, and direct-child pagination. Server/Core Cargo
checks and 100 GUI component tests passed. A real isolated PostgreSQL contract
test passed for identity, same-Channel parents, cycles and non-empty deletion.
Server 0.1.1 is deployed and ready. Candidate Core 95 / GUI 118 / Skill 55 are
built, but stable client promotion has not occurred. The scoped Trace run
`20261008T131448Z-574c9cdf` preserves preflight timeout and script-repair rounds.
Real Explorer create/nest/share/move and old Session consumer references passed
in a later round; GUI execution required correcting the case surface from
integration to gui. This is not yet a green whole-case acceptance. Six focused
workspace/Canvas component tests and production build passed after restoring
Canvas delete actions and refreshing trails after placement changes. Channel
header editing/member/Quick Share checks are explicitly included in the GUI case.

Scoped end-to-end Round `20261008T135229Z-78d174a9` under the same Run passed
26 assertions against the candidate Core/GUI and deployed Server: Explorer
nested Catalog creation, real indexed Session sharing and reading, cycle and
non-empty deletion rejection, move preserving the old consumer reference,
GUI Catalog rename persisted through Server/reload, and the retained Channel
header's actual edit/member Dialogs plus Quick Share entrance. Screenshot was
reviewed. Case-owned Session/Catalog cleanup passed. This does not qualify the
remaining affected asset workflows or claim stable client publication.

Stable promotion `0.1.170-dev` is now published through the canonical R2
publisher. Full public size/SHA-256 verification passed for Core 95
(`ba3103ac4def64b3af366d56df52f886de67c192e9939a7ea869f87c985691fe`,
44896434 bytes), GUI 118
(`f29026705bd5637a15f076739a13ae9daec8713f18da8d79f10af41a237c7283`,
1735254 bytes), and Skill 55
(`f3fde2b2aabcf9bed7a2380b35c67bc7791d960e5e145f2f91acdb736d5b60a9`,
1725279 bytes). Electron remains 23. Updated the installed macOS application
through Settings → Check updates → Update, not by replacing its files manually.
Installation receipt reports promotion 170 and all intended component versions;
the active GUI `/ui.json` reports 118 and Core's active directory resolves to 95.
Native acceptance confirms the app reloads into Add/Message/mixed-tree navigation,
retains Channel name/member/Quick Share and title bar, and Add displays the real
Catalog/Canvas/Session/Files/Skill creation entrances plus use cases/activity.
Packaged Skill Explorer discovery also returned successfully. Broader existing
navigation-case migration/tracing impact audit remains open, not silently green.

### 2026-10-08 Messages welcome identity

Messages onboarding now appears as an Agent Colab welcome message with the official website SVG avatar and author label, aligned with message rows. GUI 0.1.117-dev / promotion 0.1.169-dev published and normally installed; actual /ui.json verified 117. Production TypeScript/build passed. Public readback verified 918576 bytes / SHA-256 `51a0f75e080b6248d13b1f52176cb2da362fa28f1bc3bf2c2e1f00925af6701a`. Native Messages screenshot confirms the official avatar and author label. End-to-end Round `20261008T093357Z-d573f343` passed 33 assertions, including visible avatar, the entire welcome row scrolling away, populated Sessions hiding guides and owned cleanup.

### 2026-10-08 Give to Agent query surface

Shared handoff dialog now uses a 12px label/input gap, muted filled textarea and a subtle single focus border without the heavy outer ring. GUI 0.1.114-dev / promotion 0.1.166-dev published and normally installed; actual /ui.json verified 114. TypeScript and production build passed. Public readback verified 918053 bytes / SHA-256 `0568ef2a849a57d83bf77c4bac16b3283fdcebe401a02ce3309f13e57292355d`. Native acceptance of the same Files dialog confirms the larger label gap, filled input and subtle focused border. Trace Round `20261008T091918Z-d5e5cd42` passed both Files/Session handoff cases and all 11 assertions. No frontend unit suite was run for this presentation change.

### 2026-10-08 Global account settings

Focused AccountProfile component checks passed (3): name-save contract, device identity explanation/private-email hiding, failure visibility, optional Google dismissal, and existing Google account reminder suppression. GUI production build and Server/Core cargo check passed. Actual GUI → Core → deployed Server persistence, public artifact readback and installed acceptance pending; no live Google consent is claimed by component tests.

### 2026-10-08 Sessions empty guidance and Channel selection

Sessions guidance is restricted to an empty list. The selected Channel has a flush left white marker, lime outline and aria-current=page, keeping the icon and existing rail spacing. GUI-only 0.1.106-dev / promotion 0.1.158-dev. Verified: all 93 frontend tests and the production build passed. Canonical GUI publication publicly verified 914381 bytes / SHA-256 `6fb16b6d6d592c34e376c8dfa1f715569df07058f0dbd5eaeaf810ac4944cd6d`; the normal updater installed GUI 106 with all other component versions unchanged. Native acceptance confirmed populated Sessions has no guidance, empty Sessions retains it, and the white marker/outline follows Channel switching. Trace Round `20261008T025951Z-a7143d75` passed both selected end-to-end cases and all 36 assertions in 36.29 seconds; screenshots and owned Session withdrawal / welcome Canvas cleanup were reviewed. Both revised cases were qualified active. No full-catalog regression is claimed.

### 2026-10-08 regression workflow efficiency

Audited the Agent Colab routine-optimization trajectory: the 34.4-minute release turn included build/deploy/publication/installation; its first nine-case regression took 147.6 seconds. Repeated script repairs (invalid PNG, composer completion/whitespace, hover controls, guide container bounds) accounted for much of regression rework. No evidence supported deleting those relevant cases as unnecessary corner cases.

Root AGENTS now routes to the project quickstart before regression. Filtered discovery, selected-only plans, scoped repair rounds, business/release suite selection and reusable environment read fixtures are documented. Eight inspected readers opt into the separately installed skill's bounded concurrency; common GUI profile remains exclusive. Session offline reading is correctly classified isolated-write; unreviewed and state-changing tests stay exclusive. Environment resolution skips unrelated Agent probes when selected cases do not request them.

Verified real read fixtures, without creating Channels: Run 20261008T024734Z-22e0d43a (concurrency 2) passed all five selected cases in 12.48 s; sequential comparison 20261008T024811Z-ea790861 passed the same five in 17.21 s. Timings are illustrative local measurements, not a performance SLO or full-suite acceptance. The Trace source passed 48 contract tests, typecheck and UI build; its managed local installation was updated. Existing historical results are preserved.

### 2026-10-08 full-width Messages composer surface

Moved the muted background to the entire bottom composer, including Send and reply context; removed the nested input border/rounding. Placeholder retained. GUI-only 0.1.105-dev / promotion 0.1.157-dev. TypeScript / production build passed. Published and normally installed; actual GUI metadata matches 105. Native screenshot confirms continuous gray background across the whole composer, including Send, with no nested input card and the placeholder retained. Public readback verified 914181 bytes / SHA-256 `cc741b94fab811a54426c93806387bfac086899620b3b366b27fdd37a20f1e0a`. This two-class presentation adjustment has native visual acceptance; message behavior is unchanged from the separately recorded GUI 104 passing regression.

### 2026-10-08 Messages composer visibility

GUI-only canonical build / TypeScript passed. Promotion 0.1.156-dev / GUI 0.1.104-dev published with full public size/hash readback: 1724462 bytes, SHA-256 `d1c0ef6227086044e086eee6d34bdb577afe1be4ab6324f67353117b902cec6a`. Normal updater installed it; actual `/ui.json` matches 104. Native `/Applications/Colab.app` screenshot confirms the visible pale-gray bordered composer and placeholder. Unsent test typing hid the placeholder; clearing restored it and left no draft. Trace Run `20261008T023858Z-21121c2b` initially blocked during post-update Core inventory timeout; preserved Round 2 `20261008T024032Z-6d914b69` passed actual GUI sending and exact single committed message on both independent clients. No full catalog rerun is claimed. Electron/Core/Skill were neither rebuilt nor version-bumped.

### 2026-10-08 workspace continuity and feature onboarding

Installed root-cause evidence: current GUI ui.json reports 0.1.101-dev while its actual assets/index JS contains 0.1.100-dev, so the old package-version focus comparison reloads on every return. New build embeds the owning GUI VERSION directly.

Verified: 93 frontend tests across 35 files, including navigation restoration, focus reload suppression/single-flight, Messages guidance within the same scrolling stream, and Session guidance completion only after actual clipboard delivery. GUI TypeScript/Vite production build passed. Electron window lifecycle test verifies macOS close/activation retains one window and one loadURL; both Shell tests and syntax checks passed. Canvas codec 12 tests passed including welcome fixture hydration and incremental Agent edit. Server cargo check passed. A fresh, isolated local PostgreSQL exercised ordinary Channel welcome persistence/authorization/archive/reopen and the existing device-account lifecycle extended with the personal Channel welcome assertion; both targeted tests passed.

Canonical component-only builds completed: GUI 0.1.102-dev ZIP SHA-256 `f2b12e58f00190416513d5f58122eff4a637a8c23596d9a5d4fba35a64dfdf8d`; packaged ui.json matches the embedded VERSION and stale 0.1.100/101 constants are absent. Electron 0.1.23-dev macOS arm64 App/ZIP/DMG built, ad-hoc codesign verification passed; DMG SHA-256 `9b5ca63f0c637acebd8a0eada08559774d7d16afe2f94249455373e940ab8a9c`. Core and Skill were not rebuilt. These initial local development artifacts were superseded by the committed-source publication below; their hashes are not the final promoted artifacts. Electron remains ad-hoc signed, not notarized.

Initial source-phase native acceptance was blocked by cua.getState timeouts. The subsequent release phase used direct app selection successfully, as recorded below.

### 2026-10-08 published / installed acceptance

Canonical R2 publication promoted 0.1.153-dev (new GUI/Shell), then 0.1.154-dev (the previously local-only Core/Skill), then 0.1.155-dev (GUI-only readiness fix). Every new immutable artifact received full public curl size/SHA-256 readback; signed channel and installers were read back. Unchanged Windows artifacts retained their prior verified versions. Final GUI 0.1.103-dev: 914217 bytes, SHA-256 `ad1daa1915455d0bb3eaca7ac97c44ce992c361ddcedcd742ffb10b81935bd44`. Independent macOS Shell 0.1.23-dev ZIP: 111200258 bytes, SHA-256 `ea5f9bdd9f8d5015c61c6a811fb5bdcd73802254a23703c01684272580ca5b16`. Core 0.1.93-dev and Skill 0.1.53-dev reused existing artifacts without a rebuild. Server 0.1.153-dev deployed; public readiness returned `ok`.

Release 153 briefly restored the older public Core/Skill combination during normal update. The resident versions had been newer local-only artifacts. Promotion 154 corrected the public combination, then normal setup installed 155. Checked the actual resident Core path (`versions/local-core/0.1.93-dev/colabd`), GUI `/ui.json` 0.1.103-dev, installation receipt and installed Shell plist. The first long Shell download was interrupted normally for slowness. The canonical public curl range verifier prepared a size/hash-verified installer cache; normal `update-shell` completed from it. This is installed acceptance plus public readback, not a single-stream cold download qualification.

Native CUA direct selection succeeded. App display-name resolution first launched an old duplicate in the website acceptance folder; its observation was excluded from installed acceptance. Explicit `/Applications/Colab.app` ran main PID 5150 / renderer PID 5312. Native cold launch restored the selected regression Channel / Skills tab. Updating the running GUI from 102 to 103 triggered one intended focus reload and restored the same workspace. Subsequent macOS window switching returned an unchanged tree without loading/Home reset. Close/reactivate retained renderer 5312 and the selected Skills tab. GUI focus/navigation behavior and the additional host close/activate behavior are separate acceptance scopes.

Trace runner setup check, project init, catalog discovery and planned selection succeeded. Run `20261008T021229Z-104af39f` initially selected nine cases: six passed, three errors. An actual readiness defect in the new Add my Agent action was repaired in GUI 103. Original errors remain; scoped rounds preserve script fixes for focus single-flight completion, hidden-action hover, valid PNG decoding, rich-composer input/send completion and normal message trimming. The final complete selected Round `20261008T022600Z-2a527af2` executed all nine against published/installed GUI 0.1.103-dev: **9 passed, 118 assertions, 71 excluded**. It verifies Canvas create/reopen/text, Channel rename, all three new onboarding cases, Session/Skill handoff and independent-client message delivery. Screenshots were reviewed: all Messages tips are outside the viewport after seven committed turns, Session review completion survives reload with unfinished handoff retained, default Canvas edits are durable, and generated icons decode in header/rail. Test Session withdrawal, Canvas archival and original Channel identity restoration have readback checks. The three new scripts were explicitly qualified active after this review. Earlier failures and all six rounds remain immutable evidence. This is acceptance of the selected release scope, not a new execution of the complete 80-case catalog.

First-use feedback: Trace setup and CLI entry worked; the repository lacked a single quickstart connecting skill commands, environment bindings, plan selection and Run/Round records. Added `regression_test/README.md` with verified commands and the actual script/environment pitfalls. No Trace runtime changes were needed. The installed artifact-release skill’s Colab section refers to a stale Omni/KCDN path; this release followed repository AGENTS.md / canonical R2 instead.

### 2026-10-07 Existing Claude Code history acceptance

Installed Skill/Core discovered real local Claude source catalog 08855b0f4dd0858e70a2b62f (2516616a-f12e-4b9e-9a05-0e8f01a5a1c3.jsonl), shared it through the existing regression Channel, then read latest user turn and previous user turn using the returned snapshot cursor. All commands returned ok:true without launching or authenticating Claude Code. Test share CC history acceptance 2026-10-07 was withdrawn; original history unchanged. This validates discovery/share/snapshot/read/pagination, not complete assistant/tool projection fidelity or a second-device consumer. Existing first-user-text default title limitation also applies to Claude sources.

### 2026-10-07 Channel overflow / Session row repair

Production build and 86 frontend tests passed (not E2E). Canonical publisher verified GUI 907936 bytes / SHA-256 339545af69b5d4369e1ffccff71b499a5315f1bece88ccd1b10b9e4499888bac. Normal updater installed GUI 0.1.100-dev. Native app refreshed, actual demo long Session rendered as one line with avatar at top and owner/source/time together. Native rail scroll reached bottom Channels/Create while Settings remained fixed. Actual row hover exposed Give/Withdraw without reserving width. Screenshot ignored dist/ga-review/session-row-fixed.jpg. Narrow-width truncation and tooltip visibility were not independently exercised; no full Trace regression claimed. Default name limitation remains documented in implementation-plan.

### 2026-10-07 Minor typography / spacing cleanup

Three existing resource row class changes only, confirmed by source diff. TypeScript/Vite production build passed. No end-to-end regression or installed visual acceptance claimed; this source-only change is not yet released. Existing Core/regression dirty files were not included.

### 2026-10-07 Resource visual rollback

Restored pre-refinement presentation at user request: git diff 4271026 -- desktop/ui/src desktop/ui/tests docs/interaction.md is empty. The earlier 93 Vitest tests are frontend unit/component/source checks with mocks, not Trace end-to-end regression. Build passed. GUI 0.1.99-dev published with 907433-byte public readback / SHA-256 104d9d68265611c9d3de68616aae1c3a4a1a70ace6647600bd3e8d06e1cc64a9 and normal installer confirmed 0.1.151-dev promotion. Native Sessions shows original rows and actions without the rejected duplicate heading/type tiles. No full Trace regression was run. Independent synthetic concept rendered in browser and Sessions/Files tab switch passed; it is not a real product or business acceptance.

### 2026-10-07 Sessions / Files visual refinement

- Rollback checkpoint 4271026; presentation-only scope. Seven new DOM tests pass: owner click isolation, keyboard open, owner menu, disabled handoff, one empty-state share button, original Session/Files prompt contents/no body prefetch, and unchanged materialize/tree path. Production build passed.
- Full GUI suite: 93 tests across 32 files passed; production build passed. Source d22a8b9 committed before canonical GUI-only publication. Stable promotion 0.1.150-dev / GUI 0.1.98-dev published and installed with normal setup. Public readback verified 908874 bytes, SHA-256 7206e6bf3cf1ba1074c157d357821e593247e04b8dd93e65e18777ac0dc907e9.
- Installed native acceptance: Sessions/Files headers, icons and metadata render; mouse owner menu opens Withdraw; contributor opens Profile without opening handoff; Session handoff opens its existing reader prompt; Files opens actual AGENTS.md preview and its original read-only colab-browser prompt; empty Files shows exactly one real Share files action. No withdrawal, sharing or Agent dispatch performed. Screenshots are ignored local dist/ga-review/sessions-refined.jpg and files-refined.jpg. No backend changes require deployment.

### 2026-10-07 Activity / website

- GUI: 86 tests passed, including bounded page fetch, exact task from Messages/Canvas activity, nested capsule click isolation and Enter activation. Production build passed.
- Isolated PostgreSQL: activity membership, cursor pagination, coalesced reads and actor identity passed; rich preview retains atomic IDs and caps text at 160 characters. Two targeted tests passed in 0.15s. No full Server suite was run.
- Independent website: build and three release-asset selection tests passed; dependency audit reports zero vulnerabilities after patched sharp override. Cloudflare deployment produced Worker version `6eaa0714-d106-45bb-bdfd-f4cea39c805e`. Public HTML matches build SHA-256 `000663e0fb8ee08cf96c42855eef8c92be8c80eccc13bdd3f2918145501a9629`; fixed Mac download redirects to an official DMG with final HTTP 200; install script readback passes `bash -n`; unknown routes return 404 and download POST returns 405. Desktop and 390px mobile preview passed, mobile document and viewport widths both 390px. No fresh-machine installation claimed.
- Source committed as `fe2dd07` before release. GUI 0.1.97-dev / promotion 0.1.149-dev published and installed through normal setup; public GUI verification: 907440 bytes, SHA-256 `5cacbfd25d5cf74b3d1a63c5da06be944bcc68a801221c1a50943d37b7e95c93`. Server 0.1.149-dev built from committed HEAD and deployed with readiness passing.
- Native installed GUI confirms velocity headline, rich Activity capsules and Agent Profile without row navigation. Clicking an older activity opens request `2c8d6d9d-56af-4016-adc7-06d188a2c4c8`, showing its exact instruction, intermediate reply and `REGRESSION_OK`, oldest to newest, tool call collapsed. No Agent command dispatched in this acceptance. Screenshot: ignored local `dist/ga-review/home-after.jpg`.

### 2026-10-06 compact Use cases / exact activity task

85 GUI tests and production build passed. Regression covers both Messages and Canvas activity
keys opening exactly their request, not trigger message or latest task; existing bounded-page
resource navigation and retry tests remain green. Publication/native acceptance recorded below.

Stable promotion 0.1.148-dev / GUI 0.1.96-dev published from committed source 2ebf1f8.
Public artifact readback verified 907103 bytes and SHA-256
ffca20953dd136b8c9a4f0672bddea9659b5d2502a7c136d5ac1bbca78a96e89.
Installed updater confirmed GUI 0.1.96-dev. Isolated browser screenshot confirms five distinct
role palettes, labels beside case text and compact rows. Existing collapsed preference survives.
Native Home clicked a non-latest completed activity (ACCOUNT_RUNTIME_OK_0d37efdc): the Drawer
loaded that exact instruction/response and request eaa9da2d-3928-479f-9548-7d56180d2090, not
the latest ASK_OWNER task. Tool call remains collapsed. No command dispatched during acceptance.

### 2026-10-06 role-oriented Tips acceptance

- 83 GUI tests passed, including role filtering, dismiss/recovery, missing-data vs failed-request
  handling, source-bound prompts, additional-query forwarding and explicit-only remote dispatch.
- Production GUI build passed. Existing large-bundle advisory remains; no new backend deployed.
- Isolated actual GUI on port 55505: Reviewer selects only the review case; Try reports no
  teammate Session and offers the existing invitation path. No runtime task sent in this check.
- Publication and installed-GUI acceptance are recorded after the release completes; mocked
  dispatch tests alone do not claim a new end-to-end runtime execution.
- Installed acceptance of GUI 0.1.94-dev caught an over-restrictive team-summary source filter:
  own shared Sessions were omitted. Summary/review now include all Channel Sessions; only
  teammate-style/takeover restrict to collaborators. Regression asserts own sources remain visible.
- Final stable promotion 0.1.147-dev / GUI 0.1.95-dev published from committed source 27648ee.
  R2 public verification: 906680 bytes, SHA-256
  70db62649557ee12663f8515c8d6b83f93c03c04e6f37abf668c90521e7b4c17.
  Installed updater confirmed GUI 0.1.95-dev; other client components retained their versions.
- Native installed GUI verified role badges/filter; team-summary Try selects the actual shared
  Session with contributor and last-sync time; Prepare prompt includes task/source metadata;
  adding User query then Forward preserves both the prepared task and exact additional query.
  Send remains disabled until a target is selected. Cancel returns Home. No task was sent or
  source Session body read as part of this UI acceptance.

2026-10-06 Home 布局/频率跟进：GUI 74 测试及生产构建通过，定向断言验证标题紧跟三图、Agent/人频率 30 倍。GUI 0.1.93-dev 经公网 size/SHA-256 校验并提升至稳定清单 0.1.145-dev；标准安装器更新后版本匹配，真实桌面应用刷新及隔离浏览器均验证标题位于主角图右侧，其他制品不变。

2026-10-06 Home 主线验收完成：GUI 全量 74 测试及构建、Core/Server cargo check、Skill 34 测试通过。隔离 PostgreSQL 的有界分页、跨用户拒绝、重复消费聚合、撤回隐藏、Canvas创建与两类指令记录验证通过。真实 Core 托管 GUI 验证正向三角形/新文案/无框 Tips/真实共享动态、点击共享对象进入 Files 详情、Tips 收起刷新持久化。发布前源码提交 3cb4cc3、版本提交 9914fdf；稳定清单 0.1.144-dev 全部改变制品通过公网 size/SHA-256，Server 0.1.144-dev 远端 symlink/readiness 验证。本机标准安装器核验缓存中的同一已公开验证制品，安装 Core 0.1.88-dev、GUI 0.1.92-dev、Skill 0.1.52-dev；实际桌面应用刷新显示新 Home 和真实历史动态。未切换真实用户账号或组织。读取动态是成功消费的尽力上报，不回填此前未记录的读取历史；手工直接读取已下载文件不会产生新上报。

2026-10-06 Home 动效第二版：真实浏览器验证三组各三个节点、人/Agent 周期 6s/0.6s、Colab 边宽 9px；窄窗口仍三组横排。独立构建通过，正式页面未修改。

2026-10-06 Home 动效样板：独立生产构建、真实浏览器三组布局和暂停/恢复通过。正式移植、活动数据链路、窄屏视觉验收尚未执行。

### Information-association / Canvas UI follow-up — 2026-10-05

- [x] GUI TypeScript 与生产构建通过；23 文件/56 测试通过。Canvas mention hover 保持、共享 prompt 弹层 User query 与 Send、文档拖拽持久化请求和删除确认均有定向 UI 测试。
- [x] Local Core 与 Server `cargo check` 通过；Server Canvas prompt 单测验证预览与派发复用构造函数、Heading 区段、read 命令、资源说明和 User query 顺序。PostgreSQL 临时表事务成功解析 0031 迁移并回滚；这不等于真实业务库已迁移。
- [ ] 真实 PostgreSQL 迁移 0031、Canvas 拖拽跨目录/删除后列表、安装态预览→下发→Agent Runtime 完成与实际文档改动尚待端到端验收。未完成前不得宣称全部功能已交付。

2026-10-04 信息关联验证（进行中）：GUI 20 文件/51 测试与 TypeScript 检查通过，包含转发先选目标再明确发送、用户指令保留、四类资源提示词；Server 6 测试通过，包含资源引用去重与精确读取命令；Skill 30 测试通过，包含单条消息精确读取且不泄露渲染树；Canvas codec 11 测试通过，四种胶囊 Markdown 往返、相邻 patch 身份不变及伪造 URI 身份拒绝；Local Core `cargo check` 通过。现有安装态只读 CLI 可以列出真实 Channel、Agent 和 Canvas。新 Server/Core/GUI/Skill 的正式部署与更新、跨账号权限测试、真实 Runtime 执行返回、原生窗口交互均未通过门禁；原生窗口工具本轮连续两次超时。完整门禁见 `docs/information-association.md`。

2026-10-04 GUI 0.1.82-dev：47 前端测试与构建通过，R2 发布并正常更新安装；
实际 Colab 窗口刷新后截图确认消息 Agent 圆形相框完整、角标在右下角，无竖线拉伸。

2026-10-04 Messages avatar identity：前端 18 文件/47 测试通过；新增点击头像、
任务定位、hover 从头像移至卡片保持以及离开关闭回归，复用标准 HoverCard。
GUI 0.1.81-dev 经 R2 完整回读发布，正常 update 安装；installation refresh 确认
installed/latest 均为 0.1.81-dev。原生窗口自动化 getState 超时，因此未宣称原生窗口
点击验收通过；交互验证来自真实组件的 jsdom 用户事件测试。

2026-10-04 Agent stdout implementation：29 项 Python 与 6 项 Server 测试通过。
逐操作白名单覆盖六个协作 CLI；回归包含未知字段不透传、消息短回执、分页、
Markdown/胶囊正文保留、空成员更新回执和 nullable transfer tree。
Skill 0.1.48-dev 经 R2 公网 size/SHA-256 验证与 stable 0.1.128-dev promotion，
通过正常 /v1/system/update 安装；installation refresh 确认 installed/latest 均 0.1.48-dev，
安装版 output_views 与源码 cmp 一致。安装版真实只读验证包含消息、runtime、成员、
文档读取和 source 发现；隔离 HTTP fixture 执行安装版消息写入/请求回复及 transfer，
不重发用户历史 request，也不以生产删除/安装动作凑覆盖。
Server 0.1.127-dev 已部署，公网 ready=ok；recent/quoted 消息标题与正文换行由构造测试验证。
此项不宣称全部 mutation 已在生产实测，完整审查边界见 agent-output-review。

状态：当前实现主线改为独立 Rust + PostgreSQL；Supabase 与 Cloudflare 验证资产保留，但暂不继续开发。以下只保留会改变当前实现顺序、同步协议、客户端边界或上线可行性的验证项

## 1. 标记规则

- **确定原则**：由产品定位直接推出，不依赖具体技术能否成立；
- **推荐方案**：当前认为最合适，但仍可能被验证结果推翻；
- **待验证假设**：存在兼容性、性能、平台能力或工程复杂度不确定性；
- **待设计**：当前阶段尚未形成足够具体的方案，不伪装成已解决。

技术文档中的推荐方案必须能回指本表中的验证项。验证通过前，不把推荐方案写成既成事实。

## 2. 验证总账

| ID | 状态 | 要回答的问题 | 已得结论 / 下一步 |
| --- | --- | --- | --- |
| F-CANVAS-01 | **通过** | 真实 Tiptap/Yjs 文档能否由 Rust/Yrs 做确定性 Markdown 投影、局部文本 transaction 和前端回放，而不向 Agent 暴露 CRDT block | Tiptap `3.31.4` + Yjs `13.6.27` 生成包含 heading、mark、list 和 component fence 的 update-v1 fixture；Yrs `0.28.0` 正确投影并局部修改 XmlText，JS/Tiptap 回放正确且保留未修改 mark。同一 update 重复应用幂等，与独立并发 update 反向乱序应用收敛；component fence 修改返回 `structured_component_requires_tool`。[可复现 trial](../.trial/F-CANVAS-01-yjs-yrs-projection/README.md)。进入正式 Server/Core/Skill/GUI 实现，恢复与端到端只在正式代码中验证。 |
| V-CANVAS-02 | **通过（最窄正式纵向链路）** | 正式 Server/Core/Skill 是否真实保存、投影、patch，并在 Server 不可达与 Core 重启后补发 | 部署 Server `0.1.98-dev` + migration 0024；release Core `0.1.67-dev` 和 packaged `colab-canvas` 创建真实 Canvas，Yjs update 获得 seq 1，Codex patch 获得 seq 2。Server 断开时 89-byte update 以固定 clientUpdateId 留在 SQLite pending；同一数据库重启后自动补发为 seq 3/acked，Skill 读回合并内容与 `syncState=synced`。[证据](../.trial/V-CANVAS-02-core-skill-recovery/README.md)。不覆盖 typed components、双用户 GUI 和规模压缩。 |
| V-CANVAS-GUI-01 | **代码级通过；真实升级目视待用户验收** | GUI 是否在初始 CRDT 状态完成前避免挂载编辑器，并与 Messages 复用一条 account socket | GUI `0.1.60-dev` 先拉取并应用 ordered updates，之后才创建 Tiptap Collaboration editor；源码扫描只有 `api/realtime.ts` 一个 `new WebSocket`，Messages/Canvas 均订阅该 singleton。22 项 Vitest 与 production build 通过，R2 公网回读 size `743949`、SHA-256 `5697b10a…` 一致。按约定未代替用户点击更新，因此不把真实安装后的视觉/交互记为已通过。 |
| V-CANVAS-RESOURCES-01 | **通过** | Canvas 文档/嵌套目录创建、树渲染、重命名和 Agent handoff 是否使用真实 Core/Server/Skill 链路 | 根资源未渲染的根因是 Server JSON 的 nullable parent 被 GUI 错按 `undefined` 比较；GUI `0.1.62-dev` 统一归一化为 `null`。Server `0.1.100-dev`、Mac Core `0.1.69-dev`、GUI `0.1.62-dev` 经 R2 发布、完整 SHA-256 回读并在本机更新；Electron 保持 `0.1.21-dev`、Skill 保持 `0.1.45-dev`。正式 Local API 对现有 `hello` 完成临时重命名和恢复；实机强制重载后资源树显示两个根文档，New 展开为 Document/Folder 菜单且无弹层，Give to Agent 实际显示“先读 → 按需编辑 → 最后探索”。GUI 26 项、Server 6 项、Local Core 20 项测试及 production build 通过。 |
| V-GIT-01 | **通过** | shadow Git 能否完全隔离来源仓库并生成稳定 root tree | 能。已覆盖脏仓库、ignored/untracked、symlink、非 Git 目录和嵌套 `.git`；来源 HEAD/index/status 不变。详见 `.trial/V-GIT-01-shadow-git/` |
| V-GIT-02 | **结论完成，方案已修正** | shadow Git 的扫描与增量成本是否可接受 | 10 万文件首次扫描 192.3 秒，只能后台执行；已知单文件增量 0.98 秒。100 MiB 追加式 Session 会重建 101 MiB blob，因此 Session 改为不可变 segment/chunk；不再重复验证已明确的问题 |
| V-GIT-03 | **取消，不再需要** | `git2`/libgit2 能否替代已工作的 Git CLI | 这不会验证产品假设，只会替换已通过验证的实现。alpha 沿用 Git CLI；跨平台分发遇到真实兼容问题时捆绑固定 Git executable，不手写 Git object 实现 |
| V-INFRA-01 | **通过** | Supabase 能否独立承载首版服务端 | 数据库、事务、鉴权 Edge Function、private Storage 字节往返、Realtime、Queue/Cron 和搜索能力均成立。网络问题确认是本机代理未注入 CLI/Node 进程，不是 Supabase 缺陷。详见 `.trial/V-INFRA-01-baas/` |
| V-INFRA-02 | **暂停** | Cloudflare 原生模块能否组成 Colab 后端 | 本地纵切已通过，但首版已选择 Supabase，不再投入远端验证。详见 `.trial/V-INFRA-02-cloudflare/` |
| V-SYNC-01 | **通过** | Git object OID 作为 Blob 身份后，两台客户端能否完成求缺、传输、校验和物化 | 双端纵切通过；首次 4/4 objects、第二次仅传新增 4/8 objects，物化内容一致，旧 root CAS 被拒绝。目录采用 `(share_id, oid)`，不做跨 Share 去重。详见 `.trial/V-SYNC-01-supabase/` |
| V-SYNC-02 | **通过** | Supabase Storage 的断点续传是否满足大对象同步 | TUS 以 6 MiB chunk 上传 18 MiB 随机对象，首块后中断并从服务端 offset 恢复，下载 SHA-256 一致。1 GB 只保留为容量测试，不再视为协议不确定性 |
| V-LOCAL-01 | **通过** | 同一 Application Core 能否稳定同时服务 GUI 与外部 Agent 调用 | GUI + 两个 Agent 并发请求被合并为一次同步；SQLite 单写、Local API 鉴权、云端凭据不下发均通过。该验证证明共享 Core 的行为成立，但原型仍需在 V-LOCAL-02 中升级为真正独立进程。详见 `.trial/V-LOCAL-01-application-core/` |
| V-AUTH-01 | **历史验证；暂停** | Supabase 身份能否覆盖 Desktop session 生命周期和 Google PKCE | Email session 生命周期已通过；Google 路径未完成。因 Supabase 实现冻结，不再作为当前阻塞项 |
| V-AUTH-02 | **暂不验证** | 是否需要单独支持企业 SAML bridge | 首批需求尚未要求 SAML；企业 OIDC 优先。出现明确 SAML 客户后再验证，不提前制造适配层 |
| V-AUTH-03 | **通过** | 独立 Rust Server 能否用 Google OIDC 完成 Desktop PKCE、Colab session 和成员身份匹配 | 两个真实 Google 账号已完成 PKCE 登录、账号保存/切换、logout 和成员身份匹配。Server 以事务轮换一次性 opaque refresh token 并保留消费代际；隔离 session 黑盒得到首次刷新 200、旧 access 401、新 access 200、旧 refresh 重放 401，且重放后新 access/新 refresh 均为 401。Local Core 以绝对到期时间和单飞锁在到期前恢复，并先持久化新 token pair；Rust workspace 测试通过。 |
| V-ORG-01 | **核心链路通过，待真人验收** | Organization 多租户主体、切换、人员目录、组织外邀请和 Channel 加入语义是否闭环 | 真实 PostgreSQL 已迁移为 Organization Member 主体，Channel membership/创建/邀请均引用 Member；真实 Local API 已验证同一账号在两个 Organization 间切换后只返回当前组织 Channel，并验证创建 Organization 自动生成 owner Member。Desktop 已接入账号设置中的列表、切换和创建；待真人完成 GUI 验收与真实邮件邀请 UX |
| V-EMAIL-01 | **受限范围通过** | Cloudflare 免费能力能否先完成真实邀请投递 | 已启用免费 Email Routing，验证 `yuzhyuan@gmail.com` destination，为 token 增加 Email Sending 权限，并通过 Cloudflare REST adapter 真实投递 Organization 邀请。Free plan 仍只能发送到预验证地址；开放任意邀请收件人需付费或替换 provider。可靠 outbox/retry 仍是业务层待实现项 |
| V-LOCAL-02 | **macOS 通过；Windows 构建通过、实机待验** | 独立 Rust `colabd` 能否在未安装或未运行 GUI 时完整服务 Agent | Skill setup 已从远端 manifest 下载/校验/安装 `colabd`，macOS 注册 LaunchAgent；Windows 使用 `%LOCALAPPDATA%\\AgentColab`、目录 junction 与用户级 Task Scheduler。Windows MSVC Core 已完成 release 交叉编译，仍需 Windows 实机验证安装、登录自启、重启恢复与文件监听。 |
| V-LOCAL-03 | **macOS 通过；Windows 实机待验** | loopback HTTP + discovery file 是否能作为唯一 Local API transport | macOS 已实测随机端口、private discovery、稳定 endpoint/bearer、鉴权和重启重发现。Windows 已实现相同协议与平台路径并通过交叉编译；NTFS 权限、任务重启及浏览器 cookie 仍须在 Windows 机器黑盒验收。 |
| V-WINDOWS-01 | **制品链路通过，自举版构建中，实机待验** | Windows x86_64 是否能从单个桌面制品安装并独立运行 Core、GUI、Skill 与 Electron | release `0.1.46-dev` 已完成原生 Core 与 portable Electron 构建、R2 回读、平台选择及独立 PowerShell setup；实机证明旧 launcher 单独双击不构成完整安装。`0.1.49-dev` 首次加入 Core/GUI/Skill 种子，但仍错误暴露了 OAuth JSON 选择，不作为验收入口。`0.1.50-dev` 将官方 Desktop OAuth client 作为 ignored release configuration 注入构建，终端用户无需提供配置文件；待发布后在干净 Windows 账户验证首次启动、Google 登录、自动更新及 Files/Session/Skill 闭环。 |
| V-SKILL-01 | **通过** | Python 标准库 Skill client 能否覆盖首批 Agent runtime | canonical name 与安装目录统一为 `agent-colab`；Codex、Claude Code、MyFlicker 均完成真实安装/状态/卸载验收，用户修改过的安装会返回 conflict 并拒绝覆盖或删除。setup 对制品 `bin/` 中全部入口统一恢复 executable bit，不再依赖硬编码文件清单。`colab-open` 已从已安装 Skill 实测唤醒 Local Core 并打开 GUI，且 SKILL.md 明确把“打开页面”直接路由到该命令，而不是 setup 或资源查询。 |
| V-SHARED-SKILL-01 | **通过** | Shared Skill 能否完成来源发现、共享、跨账号消费、更新判断与目标 Agent 安装 | 真实 `agent-colab` Skill 根目录共享到共同 Channel；另一真实 Google 账号可读取并安装到 MyFlicker，owner 可安装到 Claude Code；非 owner 无撤回权限，owner 撤回成功。服务端保存 opaque Git revision，Local Core 使用 `root_oid` 判断更新并以 receipt 保护非托管或本地改动目录。release `0.1.42-dev` 已完成 Server 部署、R2 公网回读、安装升级与真实命令验收。 |
| V-RELEASE-03 | **通过** | 独立 artifact 版本与 Agent target 操作 | `0.1.15-dev` channel 中 Core/GUI/Skill 为 `0.1.15-dev`、Electron 为未变化的 `0.1.12-dev`；安装 receipt 与 `/v1/system/installation?refresh=true` 均返回相同的独立版本且 Electron 无虚假更新。经真实 Local API 往 MyFlicker target 执行 install → 验证 `SKILL.md` → uninstall，均成功并恢复未安装状态。 |
| V-RELEASE-04 | **通过** | Local Core 更新能否由普通浏览器恢复且不依赖 Electron | release `0.1.29-dev` 实测：受管更新响应 `restartScheduled=true, previousPid=65800`；更新后 endpoint 仍为 `localhost:53393`，原浏览器 HttpOnly cookie 无需重新 bootstrap 即可访问新 PID `85086`。GUI 只在显式更新后的最多 30 秒内每 500ms 探测 PID并 reload，另在窗口重新获得焦点时做一次 GUI 版本比较，不运行后台更新轮询；Electron `0.1.14-dev` 只在创建窗口时读取一次 discovery。旧 `0.1.27-dev` 的轮询方案与结论作废。 |
| V-FILES-GIVE-01 | **通过** | Give to Agent 能否一次取得可消费上下文并前往默认 Agent | `0.1.16-dev` 安装后运行可读引用 `Files tree validation`，响应同时包含来源根 `localPath` 与 4 项 `tree`；Python 测试验证非来源消费调用 `materialize?wait=true`。SQLite 默认 Agent 写入/读回为 `codex`，allow-list 打开接口返回 204。GUI 构建通过并使用 Dialog + ButtonGroup + DropdownMenu。 |
| V-RELEASE-01 | **alpha 主链通过，发布强化延后** | 多制品能否独立构建、分发、安装和运行 | Cloudflare R2 已成为唯一客户端制品源；当前 stable `0.1.12-dev` 的 Local Core、Desktop GUI、Skill、Electron 使用不可变版本 key，并通过公网回读校验。GUI 已分别显示 Local Core、GUI Resources、Electron Shell 的 current/latest，并按 Codex、Claude Code、MyFlicker 检测与操作 Skill；Claude Code 安装/卸载已验收。Electron Shell 已从 0.1.8 独立更新至 0.1.12，并保留旧 App 备份。Electron 仍为 ad-hoc 签名且尚无 Apple Developer ID/公证。 |
| V-FILES-01 | **双账号单机通过；产品与可靠性闭环通过** | Files 是否符合共享而非协同编辑的产品语义 | 两个真实 Google 账号在共同 Channel 完成目录与单文件分享；首次登记立即发布，2 秒静默窗口后 root 自动推进。消费方先读取旧物化缓存，再由 durable materialize job 刷新。`0.1.10-dev` 实测 12 个 watcher 事件合并为一次执行、运行中 generation 不丢事件、running job 强停恢复、失败退避与手动重试、缓存 15ms 返回后后台刷新完成。物化位于 Application Support 并按贡献者/分享名称寻址；不再要求第二台物理设备。 |
| V-FILES-STORAGE-01 | **通过** | Files/Skill Blob 大对象边界、配额和孤儿回收是否避免堆内存放大与无界磁盘增长 | Server Files/Skill pack 改为临时文件流式写入、256 MiB hard limit、`fsync` 后原子改名及流式下载；边界测试确认超限不发布 partial Blob。每贡献者 active revision 2 GiB 配额由 advisory transaction lock 串行核算，真实部署黑盒返回 HTTP 413 `storage_quota_exceeded`。小时 GC 从 active Channel shares 与未过期 Quick Shares 计算可达集，并以一小时 grace 回收 failed/withdrawn/expired Blob。 |
| V-SESSION-02 | **通过；大历史同步与 GUI 退场复验完成** | 保留原始 Session 后，增量同步、来源 adapter、固定快照分页和跨账号消费能否闭环 | Server 只保存 opaque JSONL segment/snapshot；真实 Codex 与 MyFlicker 来源均由已安装 Reader 在读取时投影。2026-09-29 复现 258+ MiB Codex 首次同步被单请求拖垮：改为约 8 MiB 完整-record segment、每段持久化 offset/snapshot、冻结本轮长度和按当前 user 限定贡献源。原 `offset=0/snapshot=null` 的真实 Share 已推进到 266,353,053 bytes 并读出固定 snapshot；切换到另一 Google 账号仍成功读取且没有借用贡献者本地源。后续又确认 GUI 预览会先物化整个快照并把本地 JSONL 全量读入内存，因此 release `0.1.53-dev`（Core `0.1.37-dev`、GUI `0.1.31-dev`）删除 GUI 正文预览，只查询 Share 元数据并显示最近同步时间；同一 Share 的后台、手动和 Reader 触发同步由 Local Core 串行化，避免并发 CAS 产生 `session_snapshot_conflict`。R2 发布、完整回读、安装升级与已安装资源检查均通过。Agent Reader 首次消费仍会把缺失 segments 逐段流式落盘后在本地全量投影，这是明确保留的独立消费路径和后续性能改进点，不再由 GUI 隐式触发。 |
| V-AGENT-TOOLS-01 | **通过** | 分发后的 Agent 脚手架是否真正可执行，并能跨账号完成三类 Shared Item 闭环 | 临时安装树直接执行 `colab-open`、Browser、Session Reader、Skill Tool 和 setup，捕获并修复 `lib` 包路径错误。真实安装后 E2E 由 `yuzhyuan@gmail.com` 分享临时 Files/Session/Skill，`jeffreyyuzhyuan@gmail.com` 列出三项、校验 Files 内容、读到 Session turns/snapshot、往 MyFlicker 安装再卸载 Skill，最后 owner 撤回三项。测试脚本位于 `.trial/E2E-AGENT-TOOLS-01/`。 |
| V-SESSION-03 | **通过** | 本地 Session 清单能否快速、完整地覆盖三类 Agent，而不在打开选择器时解析正文 | 清单查询只读 SQLite；已安装 Core 实测 200 条约 12ms、按 ID 搜索约 6ms。MyFlicker 与 omni-colab 基准一致，共 73 条：新版 CLI 54、旧版 CLI 11、Desktop 8；排除了 2000+ 个 `requests/` 请求碎片。Desktop 独立 adapter 的覆盖、rollback 和工具调用投影有 Rust fixture 测试。发布验收版本为 release `0.1.33-dev`、Core `0.1.27-dev`、Skill `0.1.24-dev`。 |
| V-FILES-03 | **通过** | 超大或误包含构建物的共享源是否会拖死同步 | `agent-colab` 曾因构建物进入 shadow index 产生超过 2 GiB 对象，而 Server body limit 为 256 MiB。release `0.1.36-dev` 已安装复验：按 shadow `info/exclude` 排除 102,559 文件/20,071,279,289 bytes，纳入 393 文件/47,483,603 bytes，预览约 4.2 秒；真实临时 Shared Item 首次发布约 4 秒完成并得到 root `9972e3fe…`，随后已撤回。范围 PATCH → durable job completed → GET 读回均通过，SQLite schema 不含 exclude 配置，来源 `.gitignore` hash 保持 `8a8346e3…`。现有单文件 100 MiB/总量 200 MiB 预检阻止不可能进入单请求的工作；更大对象的分块传输仍属后续 transport 能力。 |
| V-CONTRACT-01 | **Supabase 恢复时验收** | Supabase 与独立 Rust+PostgreSQL 后端是否具有相同产品语义 | 当前只验收 standalone；恢复 Supabase 后再让同一套黑盒测试运行两次 |
| V-PUBLIC-01 | **通过** | 首次加载、前台请求状态与公开 GitHub 分发是否形成可理解、可复验的 alpha 体验 | GUI `0.1.30-dev` 构建与 request-activity 并发测试通过；首次无数据时显示 workspace loading，已有数据时 foreground request 显示顶部 loading，后台 reconciliation 静默。release `0.1.47-dev` 六个制品已通过 R2 公共 size/SHA-256 回读；public repository `kwgjjeffrey/agent-colab` 与含描述性资产名的 GitHub prerelease 已创建，匿名 manifest 下载 hash 与 Windows executable HTTP Range 下载通过。macOS DMG 从 release `0.1.52-dev` 已发布 ZIP 中的同一 App 生成；挂载后通过深层签名、bundle version 和 ASAR 摘要一致性验证，GitHub 完整回读为 110,809,491 bytes、SHA-256 `71733a62…4392`。README 中四张架构图已从 GitHub 运行时 Mermaid 改为仓库内静态 SVG，并保留可编辑 `.mmd` 源；公开页面不再出现 Mermaid `Loading`/rich-display failure，四个 SVG 均通过 XML 校验并由 GitHub 以 `image/svg+xml` 提供。 |
| V-FILES-PREVIEW-01 | **流式链路通过，待真人视觉验收** | Files 是否能以 IDE 式信息架构预览常见格式，同时避免 Local Core 缓冲大文件 | GUI 已拆为全窗 File Explorer（目录树 + 内容区）；文本、图片、PDF、`.docx`、`.xlsx` 分别使用原生或按需 renderer。release `0.1.54-dev`（Core `0.1.38-dev`、GUI `0.1.32-dev`）通过 Rust/GUI 构建、R2 完整回读和实际安装；已安装 Core 对真实 `Doc1.docx` 以 `ReaderStream` 返回 371,251 bytes，MIME、`nosniff` 与源 SHA-256 完全一致。未知/损坏/超限文件只在预览区降级，Office 前端解析上限为 25 MiB；待真人完成树导航及各格式视觉验收。 |
| V-FILES-PICKER-01 | **通过** | Files 能否真正以一个操作选择文件或目录，而不是把二选一藏进下一层菜单 | release `0.1.64-dev` 删除 Channel Files 与 Quick Share Files 的两处 file/folder dropdown，并增加源码回归测试。安装 Core `0.1.46-dev`、GUI `0.1.39-dev`、Electron `0.1.19-dev` 后重启实机验收：Channel 只有 `Share files`，Quick Share 只有 `Choose Files`；一次点击打开同一原生列表，其中普通文件与目录同时可选。Windows/macOS Core 与 Shell 制品均完成 R2 size/SHA-256 回读。 |
| V-TRANSFER-01 | **主体通过；跨账号与到期/GC 待验** | 未注册、未加入 Organization/Channel 的贡献者能否安全完成一次性上下文交付 | release `0.1.59-dev` 已部署 migration/API 并经 R2 完整回读、本机真实升级。真实 Files 快照得到 create 201、receive 1 item、登录账号 `Zhiyuan Yu` 使用记录、有效期更新和 revoke 204，管理清单保留 revoked 状态；GUI 目视确认类型下拉、视口内结果页、访问者与重新管理入口。整仓 `make check` 通过。仍需第二账号/匿名领取、干净 bootstrap、自然到期/超额/GC 黑盒。 |
| V-TRANSFER-UI-01 | **通过** | Quick Share 结果弹层在内容滚动时，底部操作区是否始终位于弹层边界内 | 根因是 shadcn `DialogFooter` 被嵌入带独立 padding/scroll 的 `ResultView`，其标准负边距相对错误容器计算。release `0.1.65-dev` 改为 `DialogContent` 的直接子节点并让 `ScrollArea` 只包裹正文；GUI 单测/构建、R2 size/SHA-256 回读、真实安装均通过。实机重开历史 Quick Share 后确认 footer 完整收在圆角 Dialog 内，正文滚动区、分隔线和操作按钮互不侵占。 |
| V-AUTH-WECHAT-01 | **待调研/验证** | 微信开放平台 OAuth 能否与现有 Google identity 安全共存 | 先确认目标客户端类型、所需开放平台资质、回调域名和 unionid 可用范围，再验证 provider identity 映射、显式账号关联与真实登录；不按昵称或未验证邮箱自动合并。 |
| V-INVITE-OUTBOX-01 | **可靠性通过；任意收件人送达待外部条件** | 邀请是否会因邮件 provider 延迟/失败丢失或让业务请求假失败 | 邀请与 `email_outbox` 在同一 PostgreSQL 事务提交，API 真实返回 202/`queued`；部署环境用不可送达测试地址验证 worker 已领取一次、记录失败并退回 pending，后续按 capped exponential backoff 重试。成功后删除含短期明文 token 的 outbox 行。任意公网收件人送达仍等待 VPS 出站 25 与 rDNS 工单，不标记通过。 |
| V-CHAT-01 | **Codex 主路径通过；崩溃 lease 与 owner approval 待后续** | 一个真实 provider session 能否由指定 Local Core runtime 按 Conversation binding 恢复 | `jeffreyyuzhyuan` 的真实 runtime `kwaideMacBook-Pro.local · Codex` 已由 Skill 安装记录登记；`Runtime Validation Agent` 精确绑定该 runtime。第一次 request 创建 Codex thread `01a0f275-5430-7e11-85bf-4022f842f7c3` 并回传 `runtime validation pass 3`，第二次执行实际使用 `codex exec resume` 同一 thread 并回传 `runtime validation resumed`。启动路径故障曾暴露永久 running 风险，现已增加失败上报把 provider 启动/恢复/回传错误转为 `failed`。进程硬崩后的 lease 重领与他人请求 owner approval 尚未声称通过。 |
| V-CHAT-DESIGN-01 | **通过；不再重开框架选择** | Messages/DM 方案是否把入口、blueprint、技术选型、ER、模块和关键时序说清楚 | 最终决定由 Colab 在现有 Rust Server/PostgreSQL 中拥有 room/message/Agent 领域，Axum WebSocket 只传失效通知，HTTP+cursor pull 保证正确性。Matrix/Tuwunel/OpenIM/Tinode 会带来独立服务、状态库与身份/房间映射；Centrifugo/Mercure/MQTT只覆盖传输或 broker，并不减少首版领域实现，因此均不进入当前部署。只有未来明确出现 federation、第三方协议客户端或 E2EE 需求，才以新证据重新立项，而不是重复当前选型讨论。 |
| V-MESSAGES-UX-02 | **主体通过；最终安装包回归待发布后复核** | Message/MessageGroup 组件、空响应、Agent 新建/选择/删除、合并 runtime 选择、提示自动消失 | 真实 GUI 已验证消息时间线、发送/回复、创建后自动加入 Channel、删除入口、`Create by my agent` 主操作、单一 runtime Select 与自动消失通知；HTTP 204 不再被误解析为 JSON。Local Core 补齐 runtime 字段透传后，需要用下一稳定制品再做一次选择器标签截图回归。 |
| V-AGENT-HANDOFF-01 | **主路径通过；分支与故障注入待验** | `@Agent` 是否以完整富文本正文和结构化 identity 由正确 runtime 执行，并由 Agent 自主回写 | 用户真实 seq 32/33 最终暴露两个剩余根因：空闲 runtime WebSocket 半开后服务端 presence 消失，以及立即触发的心跳 Ping 抢在 command ACK 前到达。Core `0.1.61-dev` 改为 20 秒延迟心跳；Server `0.1.83-dev` 在十秒 ACK 窗口内处理控制帧并只接受精确 request ACK。旧 `codex exec` 绑定以 adapter version 1 作废；app-server version 2 新建 Codex Desktop 可见 task `01a0f5ed-1c88-73b0-a73e-7c5e9a71f520`。两个既有请求均从 queued 转为 succeeded、Local receipt 为 completed，Channel seq 35/36 均收到 `我收到了你的消息`；Codex `list_threads` 直接返回该 task 及真实中文请求摘要。自动测试覆盖两个 Agent 和重复 mention 去重；仍待真实双 Agent 扇出、owner confirmation 与执行中断线重投。 |
| V-AGENT-WRITER-01 | **macOS 安装态通过；跨 thread 压测待后续** | Codex thread 的 writer 被占用时，后续 Channel command 是否保持同一逻辑会话 | 双 app-server 验证：A resume 成功；B 得到 `already has an active writer`；A unsubscribe 后 B 可在同一 thread resume。非持有者 unsubscribe 返回 `notLoaded`，不存在 force takeover；Desktop 可以读取别的 app-server 持有的 thread。[可复现 trial](../.trial/V-AGENT-WRITER-01-codex-writer/README.md) 又确认 active 期间第二次 `turn/start`/`turn/steer` 都是插入原 turn，而 `thread/queue/add` 产生独立 submission、busy 时可见、idle 时由 owner 自动消费。Core `0.1.62-dev` 安装后，四个真实 Agent request 均使用 Desktop 可见 thread `01a0f6e9-d8d0-7802-8cd8-08a2e15451db`：重启前回传 Channel seq 40/42，强制重启 launchd Local Core 后继续回传 seq 44/46，四个请求最终均为 `succeeded`。Core `0.1.63-dev` 进一步把 Desktop active-writer 作为非致命所有权冲突处理；安装态 request `c47b335d…` 在原 thread `01a0f6e9…` 完成并达到 durable `succeeded`，Agent 工具回传被 Server 构造成 seq 55，包含请求人结构化 mention 且引用触发 seq 54。尚未执行两个不同 blueprint thread 的并行压力验收。 |
| V-MESSAGES-VIEWPORT-01 | **通过** | 返回 Messages 时是否保留记录与滚动位置，且整页不随历史增长 | GUI `0.1.49-dev` 以 Channel 为键保留 rows/lastSeq，返回时只拉 cursor delta；`sessionStorage` 保存 timeline scrollTop。App shell 固定为 viewport，Channel rail/settings 与 composer 固定，timeline/participant list 独立滚动；Channel identity 与 Quick Share 合并为一行，头像缩至 24px，composer 合并为单一输入表面。11 个 GUI 测试与生产构建通过；R2 公网制品 SHA-256/size 回读通过，安装到真实 macOS App 并强制刷新后，已目视确认紧凑头像、三类气泡、吸底 Settings/composer 和单层输入面。Electron 保持 `0.1.19-dev`。 |
| V-MESSAGES-RECOVERY-01 | **通过** | 代理/NAT/休眠造成 WebSocket 半开、浏览器不触发 `onclose` 时，已提交消息能否自动恢复 | 用户真实 seq 47 已在 Desktop 可见 thread `01a0f715-a4ee-7380-8528-80afd293b5a7` 完成并提交 Agent seq 48，但旧 GUI 因半开 Conversation socket 永久未刷新。Server `0.1.85-dev` 增加 15 秒文本 heartbeat，GUI `0.1.50-dev` 增加 45 秒无帧 watchdog；黑盒观察到两个 heartbeat 间隔 15.6 秒，并在保持 Local Core bridge socket 时强制重启部署 Server，客户端成功重连且 `after=47` 精确补回 seq 48。真实 Electron 页面随后目视确认请求和回信均存在。13 项 GUI 测试、Server workspace 测试、R2 size/SHA-256 回读与真实安装通过；Electron/Core/Skill 未推进。 |
| V-MESSAGES-RECOVERY-02 | **通过** | WebSocket 仍有 heartbeat、但某次业务 invalidation 丢失时，已提交消息能否自行补齐 | 用户真实电子云请求对应的 Agent 已在 Desktop-visible thread `01a0f715-a4ee-7380-8528-80afd293b5a7` 完成、上传 `electron-cloud.png` 并提交 Channel seq 50；真实 Local Core 的 `after=49` 精确返回该消息，证明故障只在 GUI 对账。旧 GUI 因 heartbeat 持续到达而不会触发 silence watchdog，也不会再拉 cursor。GUI `0.1.51-dev` 将 heartbeat、匹配 invalidation、socket open、focus 和 visibility 统一为 single-flight `after=lastSeq` reconciliation barrier。13 项 GUI 测试及 production build 通过；stable `0.1.86-dev` 的新 GUI 通过 R2 完整 size/SHA-256 回读并经真实更新路径安装，强制载入后 Electron 直接显示已有 seq 50 及其电子云图片链接，无需重跑 Agent。Electron/Core/Skill 版本未推进。 |
| V-MESSAGES-UX-03 | **通过** | 消息身份是否能在真实安装界面中一眼区分 | GUI `0.1.48-dev` 使用三类气泡和对齐：本人右侧 primary、其他成员左侧 muted、Agent 左侧 violet；28px 头像与发送者同组，Agent 用 owner 头像加超新星渐变环并显示 `<Agent> (<owner>'s Agent)`，时间和辅助操作 hover 才出现。GUI 11 tests/build 通过；安装后重启真实 Electron App，目视确认三类布局和 Agent 归属样式，Electron 版本未推进。 |
| V-MESSAGES-UX-04 | **制品已发布，待用户更新与视觉验收** | Discord 式紧凑消息流和重组后的 Settings 是否符合最新交互结论 | 移除三类气泡与本人右对齐，统一为左对齐紧凑行；真人和 Agent 使用同尺寸基础头像框，Agent 增加超新星框和 AI 标签；成员/Agent 侧栏无缩进；Messages 去除卡片外框并贴合 tab/视口；composer 去除内层边框并使用实心上箭头。Settings 首层收敛为当前 User/Organization、My Agents 数量、Skill 安装和默认折叠 Updates。新增结构回归测试，GUI 19 tests 与 production build 通过。2026-10-02 已将 GUI `0.1.53-dev` 作为 promotion `0.1.88-dev` 发布到 R2；公网回读 707,088 bytes、SHA-256 `ccc057206ac68afc741b0ea3e2fb1037577b5d3eee125da3acf5db9a8c7feecf`，stable 清单签名验证通过。Electron 保持 `0.1.19-dev`；未代替用户触发安装，真实 App 更新与视觉验收仍待完成。 |
| V-MESSAGES-UX-05 | **制品已发布，待用户更新与真人视觉验收** | 原生标题栏能否承载稳定 Loading/typing 状态，且成员 mention 与 IM 键盘习惯是否正确 | macOS Shell 使用 `hiddenInset`，GUI 常驻 36px drag slot，不再临时覆盖内容。Agent activity 只投影 Server `running` 状态；连续 WS invalidation 在 fetch 期间会排定下一轮权威对账。composer 支持 Agent/Channel member 两类不可编辑 mention；member identity 保留在 rich content 且不进入 Agent routing。Enter 发送、Shift+Enter 换行，placeholder 给出指引。GUI 21 tests/build、Shell check/build 通过。stable `0.1.90-dev` 已发布 GUI `0.1.54-dev`（707,494 bytes，SHA-256 `a9b7e466…1d64`）与 macOS Shell `0.1.20-dev`（111,195,212 bytes，SHA-256 `56bbe867…2947`），两者均经 R2 公开域名完整回读；Windows Shell 保持原版本。待用户自行点击更新并验收真实标题栏、typing 与输入交互。 |
| V-RELEASE-06 | **修复制品已发布；待安装态重试** | 慢速网络下载 111 MB Electron Shell 时，更新是否会被固定总时长误杀 | 用户安装态在 180,078 ms 下载 16,287,562/111,195,212 bytes 后被 curl code 28 中止，证明连接仍有吞吐但旧 `--max-time 180` 不适合大制品。Skill `0.1.41-dev` 删除 artifact 总时限，增加 `--continue-at -`、5 次 transport retry，以及 60 秒/1 KiB/s 低速失活判断；manifest/signature 仍有 30 秒总时限。19 项 Skill tests 通过；stable `0.1.91-dev` 已发布并经公开域名完整回读（37,474 bytes，SHA-256 `e693623f…a5685`），待用户再次点击更新后登记安装结果。 |
| V-RELEASE-07 | **macOS 安装态通过** | 长更新是否有可见进度且不污染全局 Loading | 更新 POST 改为 feature-owned activity，不进入全局 request counter；Skill 原子输出 artifact/bytes/total/speed/ETA，Core 提供只读进度 API，Updates 折叠时仍保留更新按钮和进度。反复 `Failed to fetch` 的根因不是 R2 下载，而是旧 Core 在 `/v1/system/update` 应答尚未送达时定时退出；promotion `0.1.95-dev` 将安装确认与重启拆为 `/update` + `/restart`。Core `0.1.65-dev`（5,400,053 bytes，SHA-256 `66b408e5…d5fb`）和 GUI `0.1.56-dev`（708,355 bytes，SHA-256 `ef561eab…a528`）已经 R2 完整回读，Electron/Skill 保持 `0.1.20-dev`/`0.1.42-dev`。真实 macOS 安装态验收：正式 setup 将小制品激活到 `0.1.95-dev`，launchd Core PID `57448` 通过新端点收到 HTTP 202 后更换为 `66897`；同一 Local Core HTTP 更新入口完成 Shell `0.1.20-dev` 安装，最终 installation API 报告 Core `0.1.65-dev`、GUI `0.1.56-dev`、Skill `0.1.42-dev`、Shell `0.1.20-dev`，无剩余 update。 |
| V-RELEASE-08 | **macOS 断点续传与旧版升级通过** | 网络/进程中断后是否保留进度并自主恢复 | promotion `0.1.96-dev` 发布 Core `0.1.66-dev`、GUI `0.1.57-dev`、Skill `0.1.43-dev`，Electron 保持 `0.1.20-dev`。真实已安装 `0.1.95-dev` 不使用源码 setup，通过其 Local Core 认证 HTTP update/restart 完成自升级：HTTP 202，PID `72373` 更换为 `95659`，三个当前链接均指向新版。[Range 中断黑盒](../.trial/V-RELEASE-DOWNLOAD-01/README.md) 使已安装 downloader 首进程失败并保留 65,536 bytes，第二进程续传至 8,388,608 bytes，最终 size/SHA-256 精确匹配且 progress 为 `completed`。Skill 22 tests、GUI 22 tests/build、Core 16 tests 通过；R2 公网回读完成。 |
| V-RELEASE-09 | **待用户点击验收** | 真实 111 MB Electron 制品是否在 GUI 中显示进度/速度并完成安装 | promotion `0.1.97-dev` 仅推进 Electron `0.1.21-dev`；Electron 源码与 `0.1.20-dev` 一致，Core `0.1.66-dev`、GUI `0.1.57-dev`、Skill `0.1.43-dev` 均保持不变。macOS ZIP 111,195,215 bytes，SHA-256 `00a5e35e…d84`，已经 R2 公开域名完整回读。安装态 refresh 精确报告 Shell `0.1.20-dev → 0.1.21-dev` 可更新，其余三个制品 `updateAvailable=false`；未代替用户点击更新。 |
| V-AGENT-STATE-RACE-01 | **通过** | 快速执行状态是否会覆盖创建响应；mention 是否只能位于开头 | Conversation 不再读取或渲染 Agent Request 状态，因此不存在 `queued` 响应覆盖 `running` 的界面竞态。Tiptap mention 是不可编辑原子节点，完整可见文本与 UUID rich node 一并提交；自动测试覆盖句中 mention、两个 Agent 与重复 mention 去重。GUI `0.1.47-dev` 安装后，实机输入 `Please @Run` 出现候选并插入同一行胶囊；时间线无 Queued/Working/Completed 卡片，Reply 引用条可出现并取消。 |
| V-AGENT-ACTIVITY-01 | **通过** | 用户能否看见 Agent 确实已收到任务且仍在处理，同时不把内部状态塞进消息流 | Server 将 claim 与客户端 acceptance 分开：`accepted_at` 只在 protocol-2 Local Core 对精确 request ACK 后持久化，未 ACK 的 claim 对 GUI 映射为 `delivering`；GUI 只把 accepted/running target 投影为消息区域顶部的 `is working…`，终态自动消失。request invalidation、heartbeat、open、focus、visibility 共用权威状态对账。安装态 request `c47b335d…` 在 provider queue 精确 ACK 后显示为 durable `running`，Codex 原 thread 完成后转为 `succeeded`；自动测试覆盖 activity 过滤/去重。 |
| V-AGENT-REPLY-ADDRESS-01 | **通过** | Agent 回复是否自动指向请求人和原请求，且不授予 Agent 任意 mention 权限 | `report_agent_request` 只接收 request ID/正文/nonce；Server 从权威 request 反查 requester 与 trigger message，在事务内生成 member mention rich node、完整 plain body 和 reply link。真实 request `c47b335d…` 的工具只提交 `writer fallback passed`，Server 生成 Channel seq 55：body 为 `@Zhiyuan Yu writer fallback passed`，member mention ID 为 `4df84d8f…`，`replyToMessageId` 精确指向触发 seq 54。GUI 对当前用户 mention 使用深蓝胶囊并显示引用预览，相关渲染测试通过。 |
| V-CHAT-SLICE-01 | **Channel + Codex runtime 纵向闭环通过** | Channel Messages、成员侧栏、Agent blueprint 与本机 Codex 是否形成 GUI/Skill/Local Core/Server 纵向闭环 | stable `0.1.72-dev` 已公开验证 Core `0.1.52-dev`（macOS + Windows）、GUI `0.1.42-dev`、Skill `0.1.39-dev`，Electron 仍为独立且未变的 `0.1.19-dev`；Server `0.1.72-dev` 公网 readiness 通过。双账号消息/权限/WebSocket 验收仍成立；新增真实 Skill 注册 runtime、强制蓝图绑定、目标设备 durable claim、首轮 Codex thread 创建、次轮同 thread resume、request-scoped reply 与显式失败终态。已安装 Skill 实测缺少 `--runtime` 返回 exit 2；runtime 清单返回 `kwaideMacBook-Pro.local · Codex`、稳定 runtime UUID 和最新 Skill `0.1.39-dev`。 |
| V-RELEASE-05 | **通过** | 更新检查网络失败是否仍会破坏界面，首次 Channel 请求失败是否被误报为空数据 | setup 已移除 macOS `urllib`，统一使用 `curl --noproxy '*'`、retry/timeout、落盘流式 hash；Local Core 和 GUI 将错误限制为 500 字符摘要。GUI 把 initial loading、loaded-empty、load-failed 分开，失败显示 Retry 而非 Create first Channel。Skill 18 tests、GUI 6 tests/build、Local Core 16 tests均通过。release `0.1.73-dev` 已完成 R2 公网完整回读并真实安装；已安装 API/GUI 显示三个 Channel，Settings 实际点击返回 `All Colab resources are up to date`，四项独立版本完全匹配且无 traceback。 |

## 3. 接下来的执行顺序

1. **真人视觉验收**：Files 全窗树/内容预览，以及文本、图片、PDF、DOCX、XLSX 与不支持格式降级；实现和发布链路已经通过，不替用户标记视觉结论。
2. **Quick Share 剩余黑盒**：干净未安装起点 bootstrap、自然到期/超额/GC；主体能力与发布已通过。
3. **外部条件项**：邮件任意公网收件人送达等待 VPS 出站 25/rDNS；Windows 干净账户实机等待设备；微信登录等待开放平台材料。
4. **后续加固**：健康检查与故障注入；Supabase 仅在路线恢复时运行同一契约套件，不进入当前 standalone 主线。
5. **Messages 后续**：Codex runtime 主路径已经通过；下一步只补 owner approval、进程硬崩 lease 重领，以及经用户确认后的独立 DM/group，不再重做已完成的 runtime/thread binding。

## 4. 当前确定原则

- 不触碰用户开发仓库的 Git 状态；
- 服务端只登记当前 Shared Item，不提供产品级版本管理；
- Session 原始数据是事实来源，结构化内容只是可重建投影；
- GUI 和 Agent 使用独立 Rust Local Core 的同一套能力；GUI 是可选客户端，不参与后台任务生命周期；
- Files 与 Skill 消费前物化到本地，使用本机原生工具；
- 当前只实现独立 Rust + PostgreSQL Server；Supabase 资产冻结，未来恢复时实现同一 Colab Server 领域协议。

## 5. Trial 执行模板

每个验证在 `.trial/<id>-<name>/` 中记录：

1. 对应假设 ID；
2. 测试环境与数据规模；
3. 可重复运行的原型或脚本；
4. 预先定义的通过/失败标准；
5. 实测结果；
6. 对设计的影响与最终决策。
# Canvas mention and header validation (2026-10-03)

- [x] F-CANVAS-03 最终修复：7 个生产 codec 回归、19 个 Local API 回归通过。用原文 237 个真实 updates，在打包 Node/helper 上做只读回放及追加；保留 hardBreak、两处 mention identity，产生 145-byte 增量。首版拒绝的段尾空格+hardBreak 已用显式 `<br>` 修复。最终 Core `0.1.76-dev`、stable `0.1.118-dev` 完成公网全量校验：43,671,073 bytes，SHA-256 `67db8b740a36772fe067099837787fcd0567aede2e572b542dec12e0cc3bb0a5`。
- [ ] 正式安装态回归：旧安装 Core 的正常更新下载已启动，网络速度约 10–50 KiB/s；验收调用在 600s 等待超时，但 progress 仍在增长，不能标成安装成功或下载失败。未直接复制任何源码构建产物进安装目录。`installed_verify.py` 提供安装完成后的实际 API 创建/patch/同步回读验收。

- [x] 2026-10-04 F-CANVAS-03 实现后体内：生产 `canvas-codec` 6 项回归通过；Rust/Yrs→Node helper→Yjs delta→Yrs 回放桥接测试通过（重复回放幂等、失败不修改原文）；此前 Local API 18 项回归通过。Core `0.1.75-dev` 经 canonical publisher 公网全量核验：43,671,042 bytes，SHA-256 `a80dde3db5aa6c87c813336e861b669118ae5d3b60c2c36bb09ee96e0f304b07`，stable promotion `0.1.117-dev`。GUI/Shell/Skill 不变。安装态正式更新和实际 API patch 回读尚在验收，不将已发布等同于已安装。

- [x] 2026-10-04 F-CANVAS-03 选型假设审计（实现前、体外）：真实 StarterKit/Mention schema 的 14 个往返 fixture 中 9 个 exact-tree 通过、5 个失败；明确记录空段落、标题硬换行、mark 边缘空格、strike 和 link 附加属性损失。strike 的扩展修复、身份完整 mention 链接、保持 mention identity 的段落追加与独立段落并发更新均单独通过。结果见 [.trial/F-CANVAS-03](../.trial/F-CANVAS-03-markdown-roundtrip/README.md)。不能据此声称完整 Markdown patch 适配层、真实 query 组件或安装态无损验收完成。

- [x] Desktop GUI TypeScript build accepts collaborative Mention nodes, member/Agent lookup, identity cards, inline header rename, and real dispatch.
- [x] Local Core workspace compiles with the Canvas Agent dispatch proxy.
- [x] Server workspace compiles with Canvas dispatch creation and runtime wake-up.
- [x] Installed macOS artifact: Agent mention renders as an atomic capsule; its identity card identifies `Runtime Validation Agent` as Jeffrey Yu's Agent and exposes the real dispatch action. Two dispatched requests (`4968a3a1…`, `78fa6f16…`) each reached durable `succeeded` in one attempt and reused visible Codex thread `01a0f715…`; `read_thread` showed the actual requester, Heading section, and ordered optional Canvas tools. The final installed `colab-canvas read` returned `syncState=synced` and the mention projection. The test text contained no actionable edit request, so this row deliberately does not claim an Agent content edit.
- [x] Installed macOS artifact: double-clicking the same document title in the header and sidebar enters selected inline editing on both surfaces; both call the same rename use case. The header has no lower divider and renders `Synced` immediately beside the title.
- [x] Failure-path regression: the first real dispatch exposed the pre-migration `agent_requests.kind` constraint and the first provider read exposed the wrong Yjs fragment name. Migration `0026_canvas_agent_requests.sql` and Core `0.1.72-dev` corrected them; a fresh installed CLI read proves the packaged Core uses Tiptap Collaboration's `default` shared type.
- [x] GUI `0.1.70-dev` activity regression: Messages now consumes the previously orphaned `activeAgentNames` projection. Server `0.1.111-dev` persists `source_canvas_id` for every Canvas request and migration 27 backfills unambiguous historical title matches; Canvas reconciles the matching request against `/agent-requests` on realtime invalidation, reconnect and a five-second fallback interval. The production build and all 28 GUI tests pass. Server records prove the user-observed Canvas request `fb181e53…` and Message request `aae2b3fc…` both reached `succeeded`; the prior absence was a presentation-chain defect rather than an undelivered command.
- [x] Installed Canvas editor visual acceptance: after formal update and app reload, the old Canvas request is recovered from Server and visibly renders `Runtime Validation Agent completed` in the Channel status area plus `Completed` beside `Synced`. Accessibility state exposes Text style, Bold, Italic, Bullet list, Numbered list, Quote and Code block controls; screenshot confirms centered editor content with symmetric page gutters. Stable `0.1.111-dev` public readback verified GUI `0.1.70-dev` at 748,673 bytes, SHA-256 `d51ae059…64050`.
- [x] Canvas command/card correction: Server `0.1.112-dev` returns stable `targetBlueprintId`; GUI filters active commands by document+Agent, excludes terminal states, and keeps the send action reusable. All 28 GUI tests, production build, and Server compile pass. Stable `0.1.114-dev` publicly verified GUI `0.1.73-dev` (748,824 bytes, SHA-256 `28c03634…4940d0`) and was installed through the formal updater without changing Electron/Core/Skill. Installed macOS UI shows only `Synced` in the header, no stale completed state, an unchanged `Send to Agent Runtime Validation Agent` action in the Agent card, and the paragraph hover/click handle opens Text, Heading 1–3, Bulleted list, Numbered list, Quote, and Code commands.

- [x] V-AGENT-WORK-DETAILS-01: Local Core workspace tests (20), Server workspace tests (6), GUI tests (28), and production GUI build pass. Verified task identity is derived from queue order plus `turn/started`, not prompt matching; task events close with `turn/completed`; diagnostics upload is best-effort; Drawer is task-scoped and collapses tool records. Installed-macOS validation first exposed a missing Local Core read proxy as a real Drawer HTTP 404; Core `0.1.74-dev` added that route and was installed through the formal updater. The installed GUI then displayed `Working` during a real Canvas dispatch and `Work details` after completion; the task-scoped Drawer loaded persisted `turn/started`, Agent output, retry diagnostics, command execution and tool events, with tool records collapsed by default. The same installed build no longer shows the auxiliary request-list `Error: {\"error\":\"\"}`, and an actual H1 renders visibly larger/bolder than body text. Stable release `0.1.116-dev` publicly verified GUI `0.1.74-dev` (766,873 bytes, SHA-256 `529fedaa7f9fa68f7e88523c1ce5dc138e5f66e2657f5ee4c77fc865fa85f6a4`) and Core `0.1.74-dev` (5,808,428 bytes, SHA-256 `78f8f048b97e9475127854e7da3c2c18a3dcc61a60613b1a5671ec1d03d4f652`). Electron and Skill did not advance.

## Canvas codec 与更新状态：安装后验收（2026-10-04）

- [x] V-WORK-CONVERSATION-01 (development-after implementation): 41 GUI tests pass, including real shadcn HoverCard pointer capsule→card→outside and capsule→outside, focus/Escape, and Drawer conversation/collapsed-output interaction. Installed request `5ce3d4bc…` replay: 136 raw events become one instruction, two Agent responses, three tool calls in forward order; final text confirms the actual Canvas edit. This row proves projection and component behavior, not a new runtime dispatch or live streaming.

- [x] Core 20 tests、GUI 34 tests、生产构建通过。Stable `0.1.120-dev` 经 R2 正式发布/公开 hash readback；实际更新安装 Core `0.1.77-dev` 与 GUI `0.1.75-dev`，managed PID 从 44427 变为 49521。Skill `0.1.45-dev`、Electron `0.1.21-dev` 未变；没有绕过发布链路复制源码构建产物。
- [x] 安装后普通 patch 验证：Canvas `3a53608c-8f5a-43a3-8611-157b237b48f4`，序号 1→2、synced、追加文字存在，原文/胶囊保留。
- [x] 真实 Canvas→Agent Runtime：request `5ce3d4bc-3e35-4990-80b2-56b270678774`，Canvas `41ae519e-4a1f-4d2e-94b6-40c851870aec`。Agent 自行执行已安装 Skill 的 read→apply-patch→read，三个 exit 0；指定独立段落 `CANVAS_RUNTIME_ACCEPTANCE_795512d4` 存在，两个 mention identity 均保留，Server seq 1→2、synced、request succeeded。验收脚本只创建初始测试文档和派活，不代替 Agent 编辑结果。
- [x] 正式安装 GUI：验收文档 H1 显著大于正文；新增段落与两个胶囊可见；Agent 卡片显示 Work details，任务 scoped Drawer 加载 136 个真实事件、工具记录默认折叠。此次约 160s 包含上游 WebSocket 超时重试和 HTTPS fallback，不是 codec 失败。当前过程事件在 turn 结束后上传，不计作实时 streaming 验收。
- [x] Mac Python flock→已安装 Rust status 的跨语言验证：锁持有时 running=true、state=installing；重复 POST update 返回 alreadyRunning=true 而非失败；释放后 running=false。真实安装 GUI 在折叠 Updates 区自动显示 disabled Updating 与进度。该状态测试是明确的 OS-lock fixture，不是伪造下载成功。

## Engineering tracing 验证（2026-10-04，独立记录）

- [x] V-TRACE-CLOUD-01：Management auth/environment read HTTP 200；官方 MCP workspace context 返回 test/3 datasets；真实安装树 CLI + 两个独立生产 middleware fixture 的 trace `589a7e61…` 查回 5 spans、单根、正确 parent 链、CLI JSON/exit 0。范围为隔离边界 fixture，未连接生产业务 DB，未部署。
- [x] V-TRACE-CLOCK-UNIT-01：Rust 四时间戳测试包含 5s offset 与 20/80ms 不对称路径，真实 offset 位于估计区间；拒绝回拨/负 RTT/NaN 样本。仅算法测试，不标记系统休眠或实机跨端故障注入通过。
- [x] V-TRACE-INGEST-01：Rust protobuf schema 解码，invalid IDs 拒绝，credential 属性过滤；原生 relay 的 body/数量限制已经实现。
- [x] 原有回归：Local workspace 20 tests，Server workspace 6 tests，Skill 24 tests；GUI 31 tests（包含 3 个 tracing 测试）与 TypeScript/production build 已通过。Core、GUI、Skill 的独立本地制品构建通过；未发布。
- [ ] 真实产品 GUI message 的 root/render return 与真实 CLI reader；Agent durable command/ACK/receipt/reply；Canvas durable mutation/retry/repair；匿名上报；时钟跳变/休眠/重启；Collector/配额与生产启用。

第一轮试验查回 missing root，暴露短命令同步等待云端转发超时；第二轮异步 intake 后五 span 完整。不得把 Local intake accepted 计作 Honeycomb delivered。

- [x] V-TRACE-PACKAGED-01：从新构建 Skill zip 提取 bundled SDK，真实命令 exit 0；官方 Honeycomb MCP 查回 `d381a986088c3fa819e80d6c97fff121` 的 5 spans，单根与四层 parent 链完整。Server 最终 workspace check 与 diff whitespace check 通过。仍为隔离 fixture，不是生产产品验收。

- [x] V-TRACE-LIVE-CLIENT-01：临时只读预览代理读取现有安装 Core 的真实业务数据；GUI 加载并切换 Files/Sessions/Skills，Skill 查询 Channel 列表/内容/成员。官方 MCP 在最近 10 分钟查回 GUI 14 spans、Skill 11 spans。只证明终端采集，现有 Core/Server 未部署 tracing，不能计作内部链路覆盖。实机预览发现并修复 MessagesView effect 中误插入的重复 Hook；修复后真实页面加载、GUI 31 tests 与 production build 通过。

- [x] 双 provider 配置：Honeycomb 私有 env 生成成功；Grafana Basic auth 编码与 `/otlp/v1/traces` endpoint 组合验证通过。未计作 Grafana 云端连接成功。

- [x] V-TRACE-GRAFANA-01：OTLP HTTP 200，Tempo read HTTP 200，UI 按 ID `a67de55fcf4f30f0fe4b7e1325ddb0f9` 显示 3 services/5 spans；真实只读预览查回 GUI 9 traces、Skill 4 traces。Cloud policy 已包含 traces:read/write，查询工具可使用私有凭据读取，不依赖浏览器登录。完整五 span 为隔离 fixture，真实产品 Core/Server tracing 未部署。

### Tracing production rollout — 2026-10-04

- [x] Server 0.1.121-dev 激活于 `/opt/agent-colab/releases/0.1.121-dev`，systemd active，公网 readiness 为 ok；远端与本地 Linux binary SHA-256 一致（4aef58016e76b6574d5017bddfb5227ce48d510ce20805ff3fc5c79e9c4f49e6）。私有 Grafana exporter env 已由独立 systemd drop-in 加载。
- [x] R2 signed stable channel 0.1.122-dev 发布并执行全部新增制品公网 size/SHA-256 readback。本机正式 updater 成功安装 Core 0.1.78-dev、GUI 0.1.76-dev、Skill 0.1.46-dev；Electron 与 Windows Core 保留原版本。修复 publisher 平台筛选遗漏通用 GUI/Skill 制品的问题。
- [x] V-TRACE-PRODUCTION-SKILL-01：`observability/tests/validate-production.py` 使用已安装 Skill 查询真实生产 Channel，exit 0、4 channels；Tempo 查回 `46636876e384c1999a3e4be29acc1b23`，7 spans，Skill → Core → Server 父子链完整。
- [x] V-TRACE-PRODUCTION-GUI-01：已安装 GUI 实际加载并点击 Files/Sessions，页面返回真实文件与会话。Tempo 查回 `0a9d6f4ebba91daff2d87a4129c3354a`，4 spans，GUI 0.1.76-dev → Core 0.1.78-dev → Server 0.1.121-dev。该 span 是 transport_only，不代表页面全部业务完成或 Agent 回复闭环。
- [x] 实机跨端校准：VPS NTPSynchronized=yes；Core reference=server-estimated，偏移约67 ms、不确定度134–139 ms；GUI/Skill trace quality=estimated，保留各自累积 uncertainty。单端 duration 使用单调时钟。没有执行人工时钟跳变、休眠、漂移注入，不能声称消除所有误差或支持毫秒级跨端排序。
- [x] 回归：GUI 34 tests 与 production build、Skill 24 tests、Rust Core/Server workspace tests/check、Linux release build 均通过；部署脚本 bash syntax 与 git diff whitespace check 通过。
- [ ] 全部业务入口/页面结果配对、Agent durable command/ACK/receipt/reply、Canvas outbox/retry/repair、匿名上报、时钟故障注入与生产限流仍待完成。
### Work details and identity hover installed acceptance — 2026-10-04

- [x] GUI 0.1.77-dev published through canonical R2 publisher, exact public size/hash verified; signed promotion 0.1.123-dev installed through the normal updater. Electron remains 0.1.21-dev. GUI archive: 842208 bytes, SHA-256 `a106dc8766c2db1012b2710d3c5fbfcc8d16659c38f8738a3296cfa67afb67cb`.
- [x] Installed Colab opened Canvas `CANVAS_RUNTIME_ACCEPTANCE_795512d4`; identity card exposed real Work details. Request `5ce3d4bc-3e35-4990-80b2-56b270678774` displayed highlighted instruction, expanded intermediate/final responses, three initially collapsed tool calls. Expanding the first call exposed its read command input/output. Task-specific oldest-to-newest order is explicit; startup/lifecycle protocol noise absent.
- [x] Installed card disappeared after leaving its area. Standard HoverCard automated tests separately cover capsule-to-card pointer traversal, leaving both regions, focus and Escape. All 41 GUI tests and production build passed. This acceptance reused a completed real dispatch; it does not claim a new dispatch or live streaming.
### Agent roster task entry — 2026-10-04

- [x] V-SETTINGS-AGENTS-01: GUI 0.1.80-dev, 45 tests and production build passed; public R2 artifact size 843100 bytes, SHA-256 `dd11f6072ca1f5e990a507f07546d62d5f23786e2664804f7619b10f38be6b57`. Promotion 0.1.126-dev installed through normal update/restart. Native installed GUI verified Canvas → global Settings → My Agents displays Agents dialog with existing blueprint and editable fields. Close → Canvas → Messages leaves dialog closed (consumed intent); no blueprint mutations made.

- [x] V-AGENT-ROSTER-UNIT-01: actual shadcn Popover component test verifies Agent-only task count, two distinct commands, choosing older request, working-to-terminal animation removal, delivering is not working, Escape dismissal, live elapsed and fixed terminal duration, and unknown legacy timing. Owner entry/static header regressions included; GUI 44 tests/build passed.
- [x] Server workspace 6 tests passed after timestamp/history API extension. No live database migration or installed GUI acceptance is implied by these tests.
- [x] Server 0.1.124-dev deployed, readiness passed, migration 0029 applied. `.trial/V-AGENT-ROSTER-01/timing-trigger.sql` passed against deployed PostgreSQL in a rolled-back transaction: terminal timestamp recorded once, repeated receipt unchanged, running not prematurely finished, failure recorded.
- [x] GUI 0.1.79-dev public artifact verified (843023 bytes, SHA-256 `e99f6393d744ca491184398d078e16bca2f476aba6268f931cbcf48d417ab302`), signed promotion 0.1.125-dev installed through authenticated update/restart. Installed Messages has no latest-task header, roster displays 6/27 tasks, owner management unchanged. Shared card shows owner once, summary/start/duration and explicitly unknown legacy timing. Choosing Task 24 opens request `5ce3d4bc-3e35-4990-80b2-56b270678774`, not latest Task 27; instruction/response and three collapsed tools are correct. This acceptance reuses a real completed task; running animation transitions are covered by component tests, not a new live dispatch.

### V-TRACE-ENTRY-01 — 2026-10-04

- [x] `.trial/V-TRACE-ENTRY-01` 四入口可运行样例：真实安装 GUI 三页面定位/呼吸高亮、Skill browser.open 命令显示/复制；浏览器验证通过。Files DOM animationName=trial-breathe，Messages selector 命中发送按钮；定位未触发业务动作。
- [ ] 全量入口、稳定控件 ID/资源参数、无权限与重启恢复、直接定位 Electron 原窗口、最新 trace 查询未验证；正式服务归属未决定。

### Trace Skill / MCP App foundation — 2026-10-04

- [x] `skills/trace` 新通用 Skill：任务指令与开发 AGENTS.md 分离；init/generate/check/operations/locate/source/executions/performance/trace/app/mcp 脚手架。init 可植入注册目录、OTel JS adapter、校准 adapter 与配置示例。安装副本在 ~/.codex/skills/trace，Codex stdio MCP trace 已注册。
- [x] `tracing/registry.yaml` 四入口为唯一维护源，包含 description、entry、completion、owner、source；生成 GUI TS 与 Skill JSON snapshots，digest stale 检查覆盖各目标。移除旧手工 operations.json 与 trial entries.json；trial 清单动态派生。
- [x] GUI messages.send 与控件绑定消费生成定义；Skill browser.open 消费 snapshot source/description 对应定义。trace.entry.id 经批准的 baggage 跨 Rust Core/Server HTTP 边界传播，传输 span 记录代码路径；intake 白名单保留新增字段。代码通过 GUI 48 tests/build、Skill 29 tests、Rust observability tests/check。
- [x] CLI 与 MCP 使用同一 dispatch；真实 stdio Client 验证 catalog 相同、MCP App HTML resource/mime/meta 有效；通用模块 3 tests（含 clock 过期/非对称样本与 registry 漂移/路径约束）。Skill validator 通过。
- [x] Browser fallback http://127.0.0.1:53481 展示同源清单。查询生产 browser.open `1bf8cec6f3f3fbc46a4a35ff743c0fa5` 并展开 7 spans / 3 services，Grafana 深链接已生成；从清单定位试验 GUI Files 并高亮真实 Share files 成功。
- [ ] MCP host 内实际 iframe 渲染尚未验证（本轮用协议测试与普通浏览器 fallback）；GUI locator 仍是 .trial adapter；查询是独立本地工具读取私有 Grafana 配置，尚未实现 Colab Core→Server 查询代理。
- [ ] 新入口传播/源码字段/校准失效代码尚未发布生产；旧生产 trace 缺源码字段会明确标记。全量入口收敛、异步 outbox/WS 上下文、精确源码 revision 注入、历史 registry 存储与全量 metrics 仍待后续实现。性能结果是最多100条 search sample，不能当总体吞吐量/分位数。

### Trace capability reorganization — 2026-10-04

- [x] 通用 trace 的唯一开发源移至 `~/.codex/skills/trace`；仓库内 skills/trace 副本移除。instrumentation、analysis、catalog 三个能力分别提供 SKILL.md 与 AGENTS.md，公共 dispatch 留在 lib。
- [x] colab-trace 旧查询脚本曾用于云端验证；通用 Honeycomb adapter 移入 trace/analysis，去除 Colab 默认配置路径，随后移除仓库和 Codex 的旧 colab-trace。
- [x] MCP 启动配置与 trial adapter 改为引用个人 Skill；独立 repo fixture 的 MCP/catalog 测试与 registry/clock 测试通过，当前项目 snapshot check 通过。

### Unit-owned tracing registries — 2026-10-04

- [x] 总 tracing/registry.yaml 只引用 GUI、Skill、Core、Server 的 tracing/registry.json。操作定义由所属单元维护，Core/Server 尚无注册业务操作，保持空清单而不编造覆盖。
- [x] GUI 直接 import 本单元 JSON，Skill 使用相同源码/制品相对路径读取 JSON；Skill 打包原样携带 tracing/。移除 targets.json、generated snapshots 和生成命令。
- [x] 通用 trace loader 实时遍历引用，校验重复 ID、重复引用、循环及 repo 外路径；CLI/MCP/trial 同源。相关 loader/MCP tests、GUI build/tests 与 Skill tests 验证，当前正式生产制品未更新。

### Information-association acceptance — 2026-10-04

- [x] @ 候选修复在主检出目录通过 TypeScript、3 个相关测试文件/6 个测试和 GUI 生产构建。GUI `0.1.87-dev` 从提交 `e2fb81e` 构建，正式 R2 制品经公开回读 SHA-256 `bf682f9c074289f7bc4013097c3c76d52e5e0cdc64e2cbb2347d3964edd4e941` 校验，通道 `0.1.139-dev` 已本机安装。真实 Colab Canvas 空白文档中输入 `@`：候选框在光标右下、资源/用户不再显示类型/邮箱、限定高度内可滚动到末尾；测试输入已撤销，文档恢复空白。

- [x] UI regression verifies no Files/Sessions/Canvas/Messages fetch on Channel entry, resource fetch only after opening choices, and no Message history fetch for the Messages chooser. TypeScript check and complete Vitest suite passed.
- [x] Server prompt tests (6/6) passed, including context identity and deduplicated reading instructions. A real Canvas dispatch returned a prompt with read, patch and optional exploration commands; request `ea96b9f3-46d2-48bc-b81e-0e74444405c5` reached the local Agent Runtime and succeeded. Independent Canvas readback confirmed `CANVAS_HANDOFF_OK_20261004` was appended and both existing mentions survived.

### Comprehensive operation tracing — 2026-10-05

- Static inventory: 92 GUI entries and all 39 actual CLI parser leaves (131 user entries). Runtime bindings consume unit registries unchanged; 145 Core and 86 Server coarse internal definitions pass binding/source audits. This is static coverage, not 131 independently exercised production cases.
- Explicit GUI closures and Rust task scopes preserve concurrent parents; every traced layer records original entry, owned operation and code source/revision. Files jobs, Canvas outbox and initial Session publication persist context atomically; Agent requests persist dispatch and result context (migrations 0030/0032). Historical context-less tasks remain uncorrelated.
- Final prompt capture distinguishes handoff/preview/dispatch, includes kind/template/request/source/bytes and truncation/redaction markers. GUI capability credentials are redacted. Default analysis omits prompt bodies; selected-span retrieval returns one body. Concrete Agent CLI commands carry per-invocation W3C context, separate from command identity.
- Verified: GUI build + 61 tests; Skill 33 tests (including enabled HTTP-span regression); Core 23 tests; Server 7 tests; observability 4 tests; generic trace 6 tests; CLI 39/39 and runtime 92/145/86 binding audits.
- Production/client acceptance: Skill channel creation trace 7f9dfa804959ce458f51a6c4a6f00aae has Skill/Core/Server; GUI message trace 7a4f1ae59d49556c1d49f9303a417a32 includes presentation; GUI handoff fef639d501087360afbe4eb69b0fae88 records the tagged synthetic prompt. Agent dispatch 54561756b4bccd4bbd88c3a0c9354d51 contains preview/dispatch/Server delivery/Core execution. Independent runtime trace 52f4019ec95afaf17a49396700dee77f verifies restored Agent command and GUI terminal presentation; first reply uncovered an enabled HTTP-span NameError, corrected and regression-tested before final acceptance.
- Client artifacts published with exact public size/SHA-256 verification: Core 0.1.82-trace.2, GUI 0.1.86-trace.2, Skill 0.1.50-trace.3; Electron unchanged. Server 0.1.135-trace.5 deployed. Final trace 5e53914557e086856e1c7200207f2d33 has 37 spans across GUI/Core/Server/Skill, successful reply/execution/presentation and zero missing parents. New Core independently exercised with bounded parallel delivery and zero reported drops. Main Core artifact installed; existing unrelated Agent work prevents interrupting its old live process.
- Generic development remains /Users/yuzhiyuan/my_code/trace. Generic trace source pushed as a6ddd72b65933f06df5263bd33dfab52997118f0; GitHub v0.2.0 published and installed from verified release asset. Installed runtime check ready; CLI/HTTP catalog equality confirms 131 entries; App reports current/latest 0.2.0. MCP stdio/catalog protocol passes; host-specific embedded iframe rendering and every GUI locator remain outside verified scope. Performance uses bounded search samples, not population metrics.

### 2026-10-05：GUI trace 定位补全

GUI 注册表为 92 个入口补充控件/区域、只读导航、资源与权限前提；DOM `traceTargets()` 与 span 消费同一 ID。64 个操作控件、28 个结果区域，覆盖 16 个拥有者区域。`audit-locators.py` 独立于 span 绑定审计，92/92 通过。缺失具体控件只报告所属区域，绝不把业务按钮当作导航点击。

预览修复全局定位强制依赖 Channel tab 的错误、旧 iframe HTML 缓存、滚动区域高亮被裁剪和窄窗口状态提示遮挡。后台读取标出结果区域；检查更新/更新/重启定位共享状态按钮并说明当前文字。预览注册表持续运行时加载，无清单编译副本。

验证：GUI 26 个测试文件、65 个测试全部通过；类型检查/构建通过。真实安装预览验证 Channel 列表、检查更新、更新、Files 清单、Canvas 树和 Agent 管理弹层；没有点击任何保存/发送/分享/删除业务目标。静态绑定齐全不等于全部资源、权限和弹层组合已经实测。GUI `0.1.86-trace.5` 已通过 canonical R2 发布与完整大小/SHA-256 验证，并在本机安装；GUI ZIP SHA-256 为 `4821af65427cd799519d8e941c076c9a91663c5d56647f0ded65df3b29ec16fe`。

最终安装资源 `index-CATh7rOj.js` 已在真实 iframe 验证；Quick Share 管理页 `transfers.list` 的安全导航及结果区域高亮通过。验收快照保留在本机、由 Git 忽略；可复现的定位适配器和验证步骤分别见 `observability/gui-locator/` 与 `.trial/V-TRACE-ENTRY-01/`。


### 2026-10-05 正式 Trace App 定位页面修复

先前仅有独立试验页、正式目录却无真实 GUI 预览的状态已被替代。正式浏览器入口 http://127.0.0.1:53481/ 现在拥有左侧统一入口清单、右侧真实 GUI；点击 GUI 入口通过项目适配器 /embed 在同页导航和呼吸高亮，重复定位保留 GUI 状态。Skill 入口显示实际脚手架命令。项目适配器迁至 observability/gui-locator，旧 /trial 返回 410，启动使用持久 LaunchAgent。

实际浏览器点击验证 channels.list、messages.send、system.check-update、system.update 均在正式页面产生对应高亮，未执行目标业务操作；browser.open 显示 colab-browser open。证据：observability/gui-locator/formal-app-acceptance.png。GUI 定位回归 4/4、Trace 工具测试 7/7、注册绑定审计 92/92 通过。本机 Trace Skill 已从独立源码仓安装 0.2.1-dev；这不是新的公开发行。MCP 宿主内嵌渲染未在本次验收范围内。


### 2026-10-05 Trace 目录精简验收

正式 Trace 浏览器页面改为整项选择：左侧只有入口 ID、语义、源码路径、Grafana Tempo 返回的近一小时 root span P50/P90/P95；右侧顶部只有源码与携带入口筛选条件的 Grafana Drilldown 链接，下方为真实 GUI 预览或注册命令。移除 instrumented/owner 状态标记、重复查询按钮、Trace/Span 详情及版本操作。统计来自 /api/metrics/query 的 quantile_over_time，缺失分位数不补算。

本机 Skill 已从独立开发仓更新，持久目录服务已重启。实际点击 channels.list 验证右侧同页高亮、顶部源码/Grafana URI 和左侧三个 provider 分位数；browser.open 验证脚本命令。Trace 源码测试 10/10 通过（含缺失 P90、秒转毫秒、通用属性默认值、Drilldown 精确筛选）。README 已同步新界面截图 docs/images/colab-catalog.png 与 colab-command.png。未声称本次验证了登录后的 Grafana 页面渲染。

### 2026-10-05 Git 追踪与 tracing 配置边界

源码、独立制品版本、数据库迁移、tracing 注册/适配器、可复现 `.trial` 脚本和锁文件纳入 Git；扫描清单、运行结果、验收 JSON/截图保留本机并忽略。`observability/boundary-inventory.json` 从 Git 索引移除，磁盘文件保留。私有 `observability/providers.json` 及凭据文件忽略，仓库只含占位 provider 示例；未配置 OTLP 目的地时不得默认发往维护者平台。`AGENTS.md` 记录独立 `trace` Skill 的公开制品入口。

本次验证：`trace check` 通过，四个单元注册表共 131 个操作；`skills/colab/tests/test_tracing_registry.py` 3/3 通过；`git diff --cached --check` 通过；已确认验收快照与 `.trial` 生成输出命中 Git ignore。此处不声称重新执行所有已提交业务功能的端到端验收。


### 2026-10-05 Trace 源码定位精度修复

按 TypeScript AST 核对 92 个 GUI 入口的真实 runOperation/beginOperation 调用归属，注册表明确 source.path、source.object（组件）、source.function（函数或所属事件回调）。main.tsx 内 App 的不同闭包保留实际文件归属，修正 QuickShareControl、CanvasEditor/LoadedCanvasEditor 等此前笼统或不准确的归属。目录左侧及详情顶部显示文件 → 组件 → 函数，agent source 接口返回相同元数据。

验证：92 个入口均找到真实调用；Trace 工具测试 10/10 通过，本机 Skill 更新并重启目录服务。实际浏览器点击 files.withdraw 显示 desktop/ui/src/main.tsx → App → withdrawFiles，source 命令返回相同 object/function。修改未重新发布 Desktop GUI 制品，历史 span 不会被回写。

### 2026-10-05 安装入口与上下文胶囊

最终补充验收：在已安装 Shell `0.1.22-dev` 的 GUI 中点击切到 Jeffrey，Local Core `/v1/auth/status` 同步为 Jeffrey，再通过 GUI 切回 Zhiyuan。两个实发验收请求均为 succeeded。GitHub DMG 完整公开字节范围下载共 110,808,449 bytes，SHA-256 为 `7518210857382f8318e0dfbc507e60ad71958e52b8ee660a7987b166458f9681`，与发布制品一致；GitHub 初始重定向元数据经代理获取，实际制品分段读回使用仓库 curl verifier、绕过代理。公开 bootstrap 完整读回 SHA-256 为 `70353a70ae873185fc2fcdc2ad3c2ddb969196e6279c1f5b23b115016b39335c`。

已通过 `pnpm --dir desktop/ui check`、`pnpm --dir desktop/shell check`、`pnpm --dir desktop/shell test`（模拟干净安装后的首启检查和二次启动复用）及 `bash -n packaging/colab-install`。Electron DMG 构建与 App 签名核验通过，已确认 bootstrap 位于 App Resources。官方 bootstrap 已实际安装本机 Core/UI/Skill；Shell 更新后 `/Applications/Colab.app` 为 `0.1.22-dev`。真实 GUI 验证长 Session 胶囊单行截断、点击卡片保留完整名称和详情入口。未声称在另一台干净 macOS 设备完成拖入 DMG 后的全流程安装。

服务端依据 Runtime WebSocket presence 决定 offline 提示；发现切号缺少主动注册/连接确认，以及 token 刷新可以覆盖前台账号的竞态，已修复并通过针对性竞态测试。额外确认助手错误绑定到测试设备 Runtime `5a7970e5-3f17-478d-ab53-1f747d1458da`，恢复本机 `aaa434e0-d264-48b0-a132-83d21664f54e`，保留原调用权限。安装后依次切换 Zhiyuan、Jeffrey，分别从 demo、1st channel @ 各自 Agent，成功收到 `ACCOUNT_RUNTIME_OK_0d37efdc`、`ACCOUNT_RUNTIME_OK_0dc19b83`；Jeffrey 请求 `7407bf82-cf73-4445-aefd-76195d80a074` 状态为 succeeded，结束后恢复原前台账号。R2 所有推广制品完整大小/SHA-256 读回通过；GitHub bootstrap 读回哈希通过，GitHub Release 制品 digest 与本机构建一致。


### 2026-10-05 Standard Trace page locator migration

Trace now owns a framework-independent page locator module and `locator-install` command. Agent Colab installed it into observability/page-locator with a version/hash receipt; the former gui-locator/browser.js highlighter was deleted. The project bootstrap imports the standard module, while the proxy retains authentication, HTTP/WebSocket transport and original live registry access. Repository project.previewUrl declares the diagnostic GUI. Normal GUI resources do not load this diagnostic module.

Verified: Trace 12/12 tests and Colab locator 6/6 tests pass, including an unrelated checkout entry using only the standard marker, untrusted origin/non-parent rejection, missing-resource fallback and navigation without executing business actions. Actual formal catalog clicks locate channels.list, messages.send and system.update; messages.send has computed animation trace-breathe. files.withdraw with no shared file reports the owning region and ok:false instead of claiming the control was located. Served runtime SHA-256 matches the command-installed module. This does not claim every project-specific route or MCP host renderer has been validated.

发行版复验：Trace v0.3.0 从 GitHub Release 校验并升级后，用已安装 Skill 的 locator-install 再安装 Colab 模块，receipt.version=0.3.0。移除目录 LaunchAgent 的 TRACE_LOCATOR_URL/TRACE_LOCATOR_EMBED_URL，正式目录从项目注册表 project.previewUrl 获得嵌入地址；再次点击 messages.send 产生 trace-breathe 动画。
# 2026-10-05 Ask me first policy correction

- Passed: `cargo test -p colab-server-persistence invocation_policy_tests --lib` (1 test). Both refusal policies reject non-owner requests; owner and Process requests remain executable.
- Passed: prompt assembly test preserves full query and reply chain. Installed-Core cross-account E2E `.trial/E2E-ACCOUNT-RUNTIME-01/ask_owner.py` rejected the non-owner request, generated the owner instruction invitation, and completed a distinct owner request with reply `ASK_OWNER_NEW_67e3af60`; the refused request stayed rejected. Original foreground account restored.
- Production migration verified: historical request `8532ae8b-0ac2-4558-9770-c456a613539c` is now rejected. No old request was replayed or retargeted.
# 2026-10-05 macOS title-bar regression

- Passed GUI `npm run check`; R2 full readback verified GUI SHA-256 `87c879cf04ea306d9778a9c21429ada12b0e012effbe359f189cde661761451f` (868886 bytes). Installed GUI 0.1.89-dev on Electron 0.1.22-dev, refreshed the native app and inspected screenshot: dedicated title row is above the rail, first Channel avatar no longer occupies the native-control region. Exercised native title-bar drag gesture. Browser/Windows exclusion remains explicit in the host/platform render guard.

### 2026-10-06 Regression trial acceptance

Run `20261006T003636Z-81eaa31e` captured a GUI readiness failure plus successful Skill case. Subsequent run at `20261006T003837Z` passed GUI Channel rail/Messages assertions and Skill Channel discovery/JSON/exit assertions in 4.83 s; runner-boundary timing limits passed. Negative fixture `20261006T004238Z-db443bf0` failed deliberately and remains rotten/excluded by default. Browser GUI at http://127.0.0.1:53482/ verified three destinations, authored description drawer, actual script read-only view, run sidebar/detail, and problems filter. Original performance page's real preview/highlight remains functional via separate 53483 diagnostic adapter. Automatic regression-to-cloud-trace association and provider/per-span performance assertions are not yet accepted.

### 2026-10-06 Regression formal directory integration

Project-owned registry, GUI/Skill cases and ignored history moved from `.trial/regression_test` into `regression_test/`. Five historical records retain their timestamps/outcomes; relocated source/evidence references now use the formal paths. Generic execution, parsing and persistence stay in the independent Trace repository. Formal workspace at http://127.0.0.1:53481/ shares React/shadcn navigation, metadata badges and syntax-highlighted script drawers. Preview uses the existing 53480 adapter; no Colab production GUI/Core/Server behavior or artifacts changed.

Verified formal browser: messages.send has trace-breathe animation, provider Grafana link carries the exact operation/origin, cases share their real project source, copy-path succeeds, historical 4.83-second run still shows two passed cases and its relocated screenshot. Trace typecheck/build and twenty tests passed. The latest historical 401 failure remains a failure; no fresh business E2E pass is claimed. Automatic provider trace correlation is still pending.

Formal runtime acceptance: run `20261006T025324Z-5d33dbe0` passed GUI and Skill (two passed, one inactive fixture excluded), total 9.19 seconds. Prior run `20261006T025229Z-cd78ee22` remains recorded: GUI readiness matched six tabs and failed strict resolution, Skill passed. Fixed project readySelector to the unique Messages tab; do not weaken runner strictness or discard the prior failure. Desktop and narrow viewport interfaces verified; package dry run has no .trial/.runtime/.runs/node_modules payload.

### 2026-10-06 Device-account onboarding sample

- Passed actual isolated two-Core → Server → PostgreSQL `.trial/E2E-DEVICE-ONBOARDING-01/verify.py`:
  bootstrap idempotence, separate device accounts, one personal Channel, ordinary-member invite,
  idempotent join, unauthorized create/revoke, revoked token rejection, no automatic Session upload,
  last-credential protection, wrong-account rejection, multiple-binding choice, selected foreground
  account, current-device unlink clearing its session and remaining binding auto-login.
- Passed isolated persistence lifecycle test (0.08 s): replay/expiry/wrong proof, concurrent bootstrap,
  multiple device accounts, access/refresh revocation, no replacement account after revocation,
  new Google identity link versus existing identity no-merge, invitation expiry/permissions.
- Passed final GUI 28 files / 70 tests (4.72 s), production build; onboarding tests distinguish Try from
  real completion and account-scoped dismiss, recover ignored tips. Passed Skill invitation test:
  own discovery endpoint, token retained in bootstrap URL, no credential/capability in output.
- Final Skill suite: 34 tests passed (12.59 s). Repeated isolated two-Core acceptance passed;
  database fixtures are restricted to a loopback `colab_device_test` database. Last-credential
  unlink rejection has a readable UI explanation and a regression test.
- Passed tracing five tests: wrapper future remains under 4 KiB around a 128 KiB business future;
  concurrent/persisted trace contexts retain correct parent and failure results. Debug Core initially
  failed with stack overflow; corrected shared wrapper allocation, then real UI + API runs passed
  on default Tokio stack. Earlier failed attempts are not treated as successful acceptance.
- Real browser UI: Home visible; Try opens Session picker; dismiss survives reload; missing teammate
  Sessions show invitation prompt; recipient link joins then opens Session picker; cancel shows
  "No shared sessions yet"; linked device + shadcn unlink confirmation visible. No user Session was
  uploaded during this acceptance. SQLite directory 0700 / database 0600 verified.
- Pending separate release acceptance: installed Electron deep-link path, fresh installer flow,
  production artifact/server versions and live Google browser exchange. Isolated identity/persistence
  tests do not claim those external deployment/provider paths passed.

### 2026-10-06 published macOS acceptance

- Server deployed at `0.1.142-dev`; remote current symlink and readiness verified.
- Stable promotion `0.1.143-dev`: macOS Core `0.1.87-dev`, GUI `0.1.91-dev`,
  Skill `0.1.51-dev`. Canonical R2 publisher verified public bytes and SHA-256;
  unchanged artifacts retained their prior verification. Source committed before publication.
- Installed updater consumed the signed stable channel and reported matching component versions.
  Existing authenticated account migrated to device login without a replacement account.
- Two fresh isolated Core instances against deployed Server passed bootstrap/repeat/isolation,
  ordinary invitation membership, idempotence, revoke and last-credential/wrong-account protection.
- Installed native App showed Home; Try opened actual Session picker; cancellation uploaded nothing.
  `colab://join` joined an empty test Channel and opened its Session picker. Acceptance caught stale
  Home requests reopening a second picker on Channel remount; GUI patch consumes the request.
  Repeated Try/cancel/invite/remount now needs one Close only and returns to "No shared sessions yet".
- GUI 70 tests and production build passed after the fix. Fresh-machine DMG installation and live
  Google browser exchange were not performed in this run; do not treat them as verified.

### 2026-10-06 — case inventory review, not business qualification

- Catalog discovery: 81 files, 78 case-only drafts, two existing executable pilots and one rotten diagnostic fixture; zero parse diagnostics.
- Generic Trace contracts cover draft exclusion even by explicit ID, ancestor Module selection and segment-boundary matching. The full generic suite passed 24 tests; typecheck and shared GUI build passed.
- No new Agent Colab functional or performance assertions have been executed. Draft metadata and expected results remain subject to human review before script implementation.
- Formal GUI on port 53481 verified: default Active list shows 80 cases (78 case-only and two implemented); selecting the derived `context` ancestor shows all 22 child cases. Prompt-assembly case drawer and source preview expose the real USECASE/META file with no run function.

### 2026-10-06 — project initialization boundary

Initialized this existing repository through Trace project-setup; only root AGENTS.md and regression instructions/example/ignore files were added or updated. A second invocation reported no changes. The underscore-prefixed example is not a case and no business case was executed. Generic tests verify preserved user instructions/configuration, idempotency, template exclusion and preflight rejection of escaped paths or malformed managed blocks.

### Regression review catalog verification

Static discovery validates 76 cases: 74 drafts and two existing pilots, zero diagnostics. Business selection includes 69 records (two executable); release selection includes seven drafts (none executable). Historical run directories remain unchanged. Case-only descriptions have not been validated as product behavior.

### Regression environment verification

Real Channel-binding pilot run 20261006T133843Z-2db3622f passed. A missing Channel override was separately run and blocked before any assertion/script execution. Generic 27-test suite passed, including profile override consumption, recorded-resource identity, unavailable-resource blocking and credential-field rejection. These checks validate environment plumbing and read-only Channel discovery, not the unimplemented Agent command execution cases.

### Regression script checkpoint (2026-10-07)

- Catalog: 76 cases, 36 executable exports, no discovery diagnostics. The formal Trace GUI reload displays executable versus case-only status from the same source.
- Trace source: 28 tests pass and TypeScript checking passes, including stdin transport with suppressed sensitive command-output persistence.
- Production run `20261007T011547Z-5cb247b6`: message nonce retry passed; the other selected pilot was blocked by inventory timeout. Inventory now batches independent reads and still reports unavailable resources explicitly.
- Production run `20261007T012447Z-05779a5d`: actual Skill source discovery passed; other failures were retained for diagnosis.
- Production run `20261007T013028Z-264f85f9`: complete Session fixture output inclusion/truncation passed. Pagination failed because the current reader rejects the previous snapshot cursor after source growth, contrary to the pinned-pagination contract in agent-interface.md.
- Real Codex requests reached `succeeded` and produced request-linked `REGRESSION_OK` replies. The initial helper incorrectly expected `completed`; it was corrected. Full feedback run `20261007T012235Z-049a5fdd` subsequently failed on a Local Core HTTP 502 while probing the reply endpoint; a later direct request-scoped probe succeeded. The failed record remains non-green.
- Owned Files fixture registration returned an active share, but no published root exists and materialization reports `No file snapshot has been published`. Do not claim Files producer/consumer verification passed.
- No full-suite success or complete implementation claim. Cross-account, controlled disconnection, installer rollback and remaining scripts/variations are unverified or not yet implemented.

### 2026-10-07 — full 76-case production regression and script verification

- Static catalog: 76 cases, 76 executable exports, zero diagnostics. JavaScript and Python bridge syntax checks pass. Exports do not establish qualification by themselves.
- Completed full run `20261007T064300Z-a39585a6`: all 76 selected; 34 passed, four failed, one error, 37 blocked; 1120.72 s. Earlier full failures remain unchanged.
- Focused rechecks `20261007T070231Z-d5d9e782` and `20261007T070725Z-8fc400be`: final evidence summary across the same 76 case IDs is 39 passed, three failed, 34 blocked. No blocked runner is called executed or verified. Read .runs/20261007T064300Z-a39585a6/report.md for per-case evidence-run links.
- Real GUI/Skill/Core/production Server and real Codex requests/results were used. Canvas heading prompt assembly, thread binding, forwarding, work details and request-specific reload checks passed. Quick Share GUI fixed snapshots and actual anonymous packaged-CLI receiving passed for Files, Session and Skill. Actual five-minute expiry/revocation and provider-trace capability-redaction checks passed.
- File preview independently passed text content, actual PNG decoding, unsupported-format notice and malformed Office failure visibility. Fixtures are case-owned and withdrawn. Canvas patch passed twice after adding exact restoration, proving the corrected script can repeat. Activity verifies actual metadata/cursor pagination, GUI navigation and absence of full-content prefetch. Skill conflict preserves locally changed bytes and restores its fixture; selected-target uninstall preserves the other target and restores the initial installations.
- Fresh sandbox installation passed using SHA-256-verified immutable release archives, signed-manifest/product installer validation and booting the downloaded Core. Cold network download had previously timed out and is not qualified by the warm-cache pass. No daily installation/account/runtime was interrupted.
- Three failed cases remain: agents.configuration.remove, agents.invocation.multiple and context.sessions.reading.page. Executed-blueprint deletion returns HTTP 500/blueprint_delete_failed; sender_blueprint_id foreign-key deletion handling is a concrete investigation lead. Old Session cursors return 'belongs to an older snapshot' after source growth, contradicting pinned pagination expectations. Neither expectation was weakened to obtain green status.
- 34 blockers still require additional signed-in members/clients, isolated auth/process/network controls, malicious-materialization fixtures or controlled release manifests. Their scripts exist and were included in full selection, but business steps did not run and their correctness is not yet qualified.
- Trace staged source update: 30/30 generic tests pass, shared GUI build succeeds, installed/source worker SHA-256 match. Timeout tests verify owned subprocess termination; functional snapshots compare nested values rather than object identity.

2026-10-07: Trace Run/Round integration verified against real Colab Skill channel discovery. Run 20261007T093625Z-c5da8dfa and its scoped second round both passed (4 assertions each). Historical executions preserved. GUI Ask Agent uses the shared run_record interface rather than a duplicated Report. This verifies regression infrastructure, not remediation of the three outstanding product failures or remaining coverage blockers. User authorized current accounts and Agents as real pre-GA testing resources; environment bindings still must describe actual available resources.

2026-10-07: Core membership wire roundtrip and snapshot cursor unit checks pass. End-to-end rechecks and complete production regression remain in progress; these unit checks do not certify all cases.

2026-10-07: All 24 Local Core tests pass after membership, pinned-view and hostile-tree changes. Real removal after Agent execution and reply preserves sender/history and denies reselection. Real member invite/remove/role checks pass across fresh rounds. Shared read fixtures must not be withdrawn by withdrawal cases; those now create independent owned targets. Device sign-in case updated to the current supported device chooser; Google linking remains a separate, unqualified provider boundary.

2026-10-07: Pre-GA production environment Run 20261007T100143Z-dbfc219d now has real distinct device-backed accounts, separate owner/receiver/member clients, scoped network/runtime controls and real signed/hostile artifact fixtures. Complete Round 3 (20261007T102452Z-cbabd0e6) executed all 76 cases: 50 passed, 14 failed, 12 errors, zero blocked. This is execution coverage, not release qualification. Round 4 rechecks script corrections; original failures remain immutable evidence. Core links were found reverted to 0.1.88-dev during the run; restored both primary and owned owner to verified 0.1.91-dev and confirmed memberId response shape. Rechecks after restoration are required before judging repaired behavior. Google linking and cold network artifact installation are not qualified by device login or warm-cache installation.

2026-10-07: All 76 implemented scripts now carry trial maturity pending explicit execution review. Trial and active are both selected for ordinary regression; a passing result never auto-promotes a case. Trace tooling contract tests 33/33, typecheck and GUI build pass, installed catalog displays Trial badges. Run 20261007T100143Z-dbfc219d completed five rounds; latest per-case evidence: 55 passed, 13 failed, 7 errors and 1 blocked. Round 3 remains the complete 76-case execution. These provisional results do not certify product readiness. Major inefficiency came from first-implementation selectors, wrong actor/cache assumptions, incomplete logout cleanup, stale running Core and resulting cascading state contamination; outstanding product candidates require evidence review before repair.

2026-10-07: Current maturity after explicit review: 75 trial, 1 active. context.sessions.reading.page promoted only after checking actual source growth, cursor uniqueness, exact original turn coverage, exclusion of the new turn and finally restoration, with repeated passing evidence in Rounds 1–3. All other first-generation scripts remain provisional pending individual review.

### Regression qualification checkpoint — 2026-10-07

Historical actions/assertions/cleanup review qualified 42 scripts without rerunning unchanged behavior. Round 6 qualified 11 additional corrected scripts; Round 7 qualified target management and public CLI discovery; Round 8 qualified asynchronous Skill update/restoration. Current lifecycle: 56 active, 13 trial, 7 rotten pending repair. Lifecycle qualification does not mean product acceptance. No case was retired solely to obtain green results.

Seven scripts have explicit repair diagnoses: three cross-member sharing cases used the same owner on a second device; Canvas reopen/read assertions lacked editor/range proof; Agent work details lacked failure coverage; thread-binding lacked selection cleanup. Cross-member scripts now use a real distinct member; repaired Canvas and message assertions are under scoped validation.

A message cold-load response can overwrite a newer locally committed message. GUI merge repair passed TypeScript/build checks and was activated locally; end-to-end verification remains pending. Core 0.1.92-dev fixes unsafe-tree validation, durable error status preservation and authenticated cached Session reads; Round 6 verified these boundaries. Full quality acceptance remains incomplete.

Follow-up qualification: current 62 active / 8 trial / 6 rotten. Round 12 verified the GUI cold-load message fix on two independent contexts and actual cross-member Files/Skill sharing; Canvas reopened editor content and persisted title are verified. Session sharing repair waits for the committed share ID and actual snapshot publication, currently under scoped verification. Installer health rejection and offline GUI recovery are qualified failing scripts with product issues still open, not false-positive script repairs. Release acceptance remains incomplete. Trace now documents actual response-contract inspection, committed-ID GUI selectors, asynchronous cleanup and distinct-identity fixtures; catalog recovery preserves live standalone runner PIDs (tested).

### Eight remaining trial cases resolved — 2026-10-07

All eight prior trial scripts are now active after review. Verified passing execution: multi-Agent invocation (20261007T123745Z-b3537470), owner reissue / member invitation / Quick Share expiry (20261007T124601Z-dcff5e91), unauthorized resource access (20261007T123407Z-b23e54a6), and Canvas move (20261007T125006Z-6def5954). The latter exposed a real missing application/json Content-Type on GUI PATCH; the GUI repair and receiver readiness assertion are verified.

Continuous Files publication remains a qualified failing case. Fresh consumer Skill ensure fails before revocation because materialized_share assumes discovery-populated metadata cache; later revocation assertions remain unreached. Neither failure is marked fixed. Current script lifecycle: 71 active, zero trial, five rotten still requiring repair. This is script qualification, not full product acceptance.

Execution infrastructure findings: CLI interruption left detached workers locking the browser; cancellation repair passed a real spawned CLI SIGINT contract test, and all 35 Trace tests pass. Running daily Core had reverted to 0.1.88-dev while the Server contract expected memberId; restored confirmed 0.1.92-dev and verified usable member identities before further cleanup. Cases now use actual committed GUI message/share identities instead of earliest-page or unstable display-name lookup.
# Native Session title validation (2026-10-07)

Trace regression case `context.sessions.discovery.native-title` is active after review of Run `20261007T132503Z-d7426da3` (1 selected, 1 passed). It executes `sessions::tests::native_title_catalog_regression` against isolated native-provider stores, verifying Codex name precedence, latest Claude customTitle precedence, unchanged discovery, metadata-only rename, fallback and transcript-byte preservation. Temporary fixtures have scope-owned cleanup on success or failure. The case explicitly covers Core catalog integration, not installed GUI or remote share acceptance.

`cargo test -p colab-local-api sessions:: --manifest-path local/Cargo.toml`: 7 passed, 1 opt-in machine test skipped. The separate `actual_client_title -- --ignored` probe passed against this machine's read-only Codex database and found `Agent colab 主迭代`. A fixture verifies renamed `name` wins over the original prompt, a metadata-only rename is reread, and missing `name` falls back to `title`. This is Core title-reader validation, not published/installed GUI acceptance.

## Six remaining results repaired and verified (2026-10-07)

Run `20261007T100143Z-dbfc219d`: scoped repair rounds `20261007T141446Z-ebb4b1fa` (Files continuous update), `20261007T141635Z-ef5ef721` (manual Retry, installer readiness, three-kind Quick Share snapshots), `20261007T142528Z-f836461e` (Canvas offline recovery) and `20261007T142740Z-4d2cdec7` (Skill withdrawal) passed. Original failures, a startup preflight timeout and the intermediate ambiguous-name script failure remain preserved. These are current per-case results, not one new full regression against every changed artifact.

Core 0.1.93-dev fixes direct Skill consumption's missing discovery metadata and restores offline account/tenant catalog navigation. GUI 0.1.101-dev hydrates persisted Canvas replicas separately from Server updates; it shows Offline rather than claiming Synced. Canvas script waits for durable outbox evidence before restart. Auth rejection never falls back to cached discovery; no replica from another account is served. Skill 0.1.53-dev probes candidate Core readiness in an empty disposable database before changing links; unhealthy candidates leave prior artifacts and receipt untouched. Database rollback is not attempted.

Manual Retry script now acquires its control before reconnect/automatic retry. Skill withdrawal uses a unique round-owned source name and failure cleanup. Retry and Quick Share scripts are qualified active after reviewed real execution. Continuous Files publication passed on the current resident runtime; its old timeout did not reproduce and no watcher product change is claimed.

Validation: Core library tests 27 passed / 1 opt-in ignored; GUI TypeScript/build passed; Skill Tool tests 2 passed; installer unhealthy-candidate probe rejected; the six scoped cases passed. Local artifacts activated for daily/owned clients; no public release channel promoted.

Planning now deduplicates identical read-only preflight requirements within its snapshot and caps distinct probes at four; execution deliberately rechecks each case. Contract validation covers both behaviors.

### 2026-10-08 — Run-owned tabs and memory verification

Generic browser lifetime stays in Trace; Colab's secondary-client adapter calls ctx.newPage and applies authentication only to requests to that client's exact Local Core origin. The Run leases primary/auxiliary tabs in one persistent Chrome context and closes the entire lease in finally; worker exit cannot orphan auxiliary tabs. No blanket browser navigation lock is applied; locks require demonstrated resource contention.

Verified with concurrency 3, Run 20261008T035038Z-35e9136d: six cases executed, five passed initially and onboarding Session navigation timed out; the latter passed when rerun alone in repair round 20261008T035158Z-c1f0e92c. This does not establish the timeout cause; the speculative navigation locks have been removed. The original failure is preserved. 69 CDP/process samples showed one window, peak four tabs (including the blank/auxiliary pages), falling page counts as workers completed, and owned Chrome processes gone at finalization. Aggregate process RSS peaked at 2028 MiB; this is process RSS, not unique physical memory or an all-day leak claim. Evidence: regression_test/.runs/20261008T035038Z-35e9136d/evidence/browser-memory-observation.json. 33 regression-tool tests passed, including three repeated batches returning to only the original blank tab.

### 2026-10-08 — Regression performance uses registered Trace roots

Run 20261008T072409Z-72bdda43, final Round 20261008T072817Z-90bc1801: GUI navigation and Skill discovery both passed with 13 real terminal-operation samples (12 GUI, 1 Skill), no collection diagnostics. Every sample comes from the exact captured Trace ID queried through the independently installed Trace analysis module; snapshots retain registry entry, entrance-to-return root duration, source, Grafana URL and span breakdown. Per-entry P90/Single summaries and explicit performance assertions consume those same snapshots. No child-span sum, local API timing or unrelated one-hour population is substituted. Source Skill scripts reuse the installed artifact's OTel dependencies through the ignored environment binding. The missing first-round Skill trace is preserved; repaired execution verified browser.open completed at result.written. No quality latency threshold is invented when the project has not configured one.
# Channel invitation validation (2026-10-08)

Published promotion `0.1.159-dev` with GUI `0.1.107-dev` and Skill `0.1.54-dev`; canonical R2 publisher verified full public size/hash and bootstrap bytes. GUI SHA-256 `acab6f51520d264037f4bd3b2e574f5706d5d19753093fba52e596e709db8797` (914973 bytes), Skill `b80f549f709dda887aa0c4ab669001497f1b724916f4fb3d0da7514e96fbff08` (1719721 bytes). Core and Shell retained existing versions. Executed the exact public curl→installer→join command, preserving the selected account; installed receipt confirms the two new versions. Native `/Applications/Colab.app` Settings showed Invite via Agent, the actual invitation prompt Dialog, and successful revoke/close. A fresh private Core SQLite/device state started signed out; the downloaded Skill automatically registered/logged in and joined the intended Channel. Temporary process/state, test Channel membership and invitation were cleaned; the isolated registered server account remains because there is no account-purge use case. A physically pristine Mac without an existing Electron app was not tested here; existing verified app installation logic is reused.

Focused Python tests: 4 passed (registration-before-join, preserved selected account, unselected multiple-account refusal, private local GUI invocation). GUI prompt contract: 1 passed; TypeScript/Vite build passed. Trace E2E `channels.members.invite-command` passed in Run `20261008T073829Z-801cbe55`, Round 3 `20261008T074030Z-ff700941`; reviewed and active. A distinct authenticated recipient joins the bound Channel exactly once as member, discovers it, and is rejected after revocation. Case cleanup removes only its membership and revokes the owned capability. First two rounds retain expiry assertion failures: PostgreSQL timestamp normalization and bounded client/server clock-skew handling were corrected. Publication and first-install/bootstrap GUI acceptance remain pending.
# 2026-10-08 compact Channel dialogs and account settings

Individual tab spacing correction: d10793e committed before GUI116/promotion168 publication. TypeScript/Vite and public full ZIP verification passed (918159 bytes, SHA-256 2bf9892b470ec1b927cbfc70bb5ab349b6f9fd1f51e7784d8ca0bc323ad4374e). Signed setup updated the existing macOS installation. Each category neighbor now has a separate background wrapper and explicit gap-2 (8px), matching inter-category spacing. Native window was in a Members dialog during final inspection; it was not dismissed or reloaded to interrupt the user's ongoing interaction, so no new native screenshot acceptance is claimed.

Tab grouping: committed a1457f0 before GUI115/promotion167 publication. TypeScript/Vite build, public ZIP verification (918153 bytes; SHA-256 fecb8f685ebd1dd7e81db60b9eca6cca6d2f51e477801a62bf75f21bea00ba94), and signed setup update passed. Native Electron after reload shows exact Home/Messages/Canvas/Sessions/Files/Skills order, four visibly distinct low-opacity category backgrounds and preserved active Sessions underline/content. No domain logic or backend changed.

Channel-name double-click acceptance: eaac8f2 committed before GUI113/promotion165 publication. Build and public size/hash verification passed (917972 bytes, SHA-256 0d0165889741879f11cc8f8ef3e4fe9741541624ed5fbf7dbd2060b68918b541). Signed setup updated the macOS installation, other components unchanged. Native Electron after renderer reload has no Edit Channel icon/button; double-clicking its current Channel heading opened the existing Edit Channel dialog with correct Name/Icon. Read-only validation, no name/icon saved. Regression entry locators updated but not rerun for this trigger-only change.

Agent manager acceptance: source 843b407 committed before GUI112/promotion164 publication; public ZIP size/hash verified (918243 bytes, SHA-256 2cc1e0696ed461e6592f0afd0d94ea466fc8dd576f24b6b3b326daa18d6256c4). Signed setup updated the existing macOS installation; Core/Skill/Shell unchanged. TypeScript/Vite passed. Native Electron verified Settings count 14 with 14 manager rows; selecting Regression Agent changed its Name and runtime from the previous blueprint, long left list scrolled to its final item, and runtime displayed kwaideMacBook-Pro.local · Codex instead of UUID. Open runtime popup was visibly below the retained trigger; policy displayed Process instead of internal process. Acceptance was read-only: no agent edits/removals or runtime rebinding saved. No new backend/performance claim.

Settings navigation follow-up: source committed at a18146b before publication. Promotion 0.1.163-dev publishes GUI 0.1.111-dev only (918009 bytes, SHA-256 bdc416d08c8c0628936d5e24dfa3b62914136eaa429c020636a63b64429c7c26); canonical R2 readback and signed setup installation passed. TypeScript/Vite build passed. Native Electron screenshot confirms unbordered vertical rows and Updates → Check updates → rightmost chevron layout. Actual Updates click opens its subpage showing installed GUI111 and unchanged Core94/Skill54/Shell23; Back returns to Settings. Account settings still opens the actual display-name/Google profile. No backend mutations, installation callbacks or credential logic changed; no claim of rerunning install/uninstall or live Google consent.

Committed before publication (`e6e66a4`); promotion 0.1.162-dev publishes GUI 0.1.110-dev only. Public artifact full size/hash verified: 918119 bytes, SHA-256 d1ba9d6d10e9e27240da1372f122ccb70b8d573e69bd551b8afe9c186e182730. Signed setup update installed GUI110 with Core94, Skill54 and Shell23 unchanged. Native Electron inspection confirms both compact dialogs, Name/Icon controls, Members/Invite via Agent and absence of the Channel Settings tab. TypeScript/Vite build and three account-profile unit tests passed.

Prior account-name E2E passed in Run 20261008T082144Z-ebc223e9, Round 20261008T082230Z-a293efa7. Extended device-account acceptance remains trial: the saved second-account fixture is not bound to that test client's device credential, and reload selects its bound account. Failed rounds are retained, not counted as accepted device flow. Native established-account Settings shows real Display name and linked Google identity; isolated PostgreSQL Google-link/login name-preservation test passed. Live Google consent was not automated.

Compact Channel E2E Run 20261008T083723Z-1179256b first round exercised both dialogs and persisted uploaded/generated images, then failed because the old header image locator now also matched member avatars. Locator narrowed to the Channel image; repair Round 20261008T083845Z-e1452f0a passed, including persisted image readback, decoded header/rail images and restoration of the original identity. No performance claim: Trace ingestion was unavailable in the first round. Existing rename/member-role scripts were migrated to the new entry points but were not rerun in this scope.
# 2026-10-09 Asset preview correction

- Regression gui.details.return now requires actual Skill and Session content,
  absence of redundant controls and breadcrumb navigation, not merely exitability.
- Added structured user-message rendering and damaged-record preservation tests.
- Candidate and installed acceptance pending; previous results do not validate this change.
# 2026-10-09 Home / Add / drag refinement

- GUI 122 TypeScript/Vite build and four Catalog workspace component tests pass.
- Isolated PostgreSQL catalog test passes: persisted before-anchor ordering,
  invalid destination-anchor rollback, cross-Channel denial, cycles and nonempty
  deletion constraints. Migration 0040 deployed with Server source bf495f1;
  readiness succeeded at /health/ready (plain /health is not an endpoint).
- Trace Run 20261008T185809Z-472a7906: gui.details.return passed. Drag Round 1
  failed to initiate native drag; Round 2 exercised actual parent/root movement
  then exposed duplicate stale tree loads. Those loads are invalidated. Round 3
  20261008T190154Z-05efed4b passes real pointer drag into Catalog, back to root,
  before ordering, reload persistence, Quick Share cascade and dialog lifetime.
  Owned empty Catalogs were removed; historical failures remain recorded.
- GUI 122 / promotion 174 published through canonical R2 full size/hash readback:
  4,610,439 bytes, SHA-256
  9aae76d5bb272da61d83a4949ec837bc0abe4bc0c6aa3bcdfea2d166019862eb.
  Core 96 / Skill 55 / Shell 23 unchanged. Native App Check updates → Update
  completed; /ui.json reports 0.1.122-dev. Native screenshot verifies Home and
  direct Add menu, Quick Share cascade, colored assets and retained Channel header.
- No new performance budget is claimed. Icon and DnD libraries are reused;
  broader trace-catalog restructuring is separate from this product correction.

## Canvas rename handoff — 2026-10-09

- 123 GUI unit tests and production build passed. Run 20261009T040252Z-328e51b6 retains an initial obsolete creation-dialog selector failure and a later preflight timeout. The Canvas creation helper now follows the real inline-name interaction; its exact leftover Untitled fixture was archived after confirming its creation timestamp.
- Round 20261009T040625Z-d410b84c passed 18 real assertions: sidebar rename without navigating away, current prompt/dialog title, no initial-title residue, stable document reference, successful actual colab-canvas content read, a second rename while dialog stays open, previously issued reference still readable, and owned document archive.
- Uses real Core 99 and Server. No model execution or latency-budget claim. Canonical R2 GUI-only publisher promoted 189 / GUI 137 after exact public size/hash verification: 1,319,075 bytes; SHA-256 e4a893acf29935951a6c603dbb5018cc417614cec5ec868c058796e49a577958. Isolated owner serves packaged GUI 137; daily App activation remains user-triggered. Other components unchanged.

## Home action guidance — 2026-10-09

- `desktop/ui`: production build passed; Vitest 45 files / 123 tests passed.
- New tests verify all seven actions in order, dispatch of the five creation kinds, primary Call my Agent styling, installed Skill / exact Channel prompt targeting, and Files configuration opening without invoking a chooser. Chooser cancellation retains configuration.
- Read-only GUI/Core acceptance passed in Run 20261009T035505Z-9762f851: seven ordered vertically aligned actions, installed Skill/exact Channel prompt, successful real explorer read, pre-choice Files configuration and Agent prompt. Screenshots are retained in that Run. This does not claim an Agent model run or a new Files synchronization mutation; native chooser cancellation is separately unit-tested. The ambient localhost:5199 tab shows the website, so acceptance instead used the independently authenticated owned Core 99 client.
- Packaged GUI 136 / Core 99 rerun: Round 20261009T035734Z-ed28dec9 passed. Repeated Vitest: 45 files / 123 tests passed. Case channels.home.actions qualified active after reviewing real observations and screenshot evidence. No new latency budget or telemetry assertion is claimed for purely local dialog opening.
- Canonical GUI-only R2 publication promoted 188 / GUI 136. Public artifact exact readback: 1,319,103 bytes, SHA-256 6a8b93ab609b4170fa11352a2a7b40bffd49922369dd00dd1a7495b3f3a2be41. Other stable artifacts retained. This verifies distribution availability, not activation of the user's daily App.

### Catalog row layout acceptance — 2026-10-09

GUI 0.1.140-dev / promotion 0.1.192-dev published and normally installed; both running GUI ui.json endpoints confirmed 0.1.140-dev. Catalog counts and contributor avatars share a fixed metadata column. The complete row owns hover and selection; the Catalog add action uses an absolute trailing gutter so it does not shift metadata. Avatar profile actions remain independent. Targeted end-to-end context.catalog.metadata Round 2 `20261009T054151Z-2421e3b5` (Run `20261009T054029Z-1ceba7e5`) passed all 34 assertions, including metadata alignment, whole-row selection, hover on the count, transparent name-button surface, real profiles and owned fixture cleanup. Hover and profile screenshots reviewed. Public GUI readback verified 1320020 bytes and SHA-256 `52e80edb50ea9b36b5bf387efcab254eaea7c09f3c5cd06d10199a28439da47b`. Only GUI built; no full frontend suite run.

### Creation cancellation and sidebar inset — 2026-10-09

Opening Session/Files/Skill creation no longer clears selection or changes the legacy preview panel. Independent Channel creation hosts reuse real sharing workflows and navigate only after successful placement. Counts and avatars now use the right inset; hidden Catalog actions reserve no trailing blank column. GUI 0.1.142-dev / promotion 0.1.194-dev published and normally installed; actual Core and authenticated GUI ui.json both confirmed 0.1.142-dev. Build/TypeScript and public artifact readback passed (1320449 bytes; SHA-256 `c091bbfb73a6046b771c73c8bea0f963f286c5eb880e51aecfd189f689c39f94`). Final Round `20261009T054907Z-5e582801` under Run `20261009T054707Z-193cee9d` passed all 61 assertions: 12 creation cancellations from existing Files/Session/Skill previews (Close and Escape), selection during modal opening, preserved breadcrumb after cancellation, no unused gutter, metadata alignment, full-row hover/selection, real uploader profile clicks and owned fixture cleanup. Targeted E2E only; no full frontend suite.

### Agent action identity — 2026-10-09

GUI 0.1.143-dev / promotion 0.1.195-dev published and normally installed; actual Core and authenticated GUI ui.json confirmed 0.1.143-dev. Shared AgentButton uses purple #7546D9 with a Lucide Sparkles supernova motif; dark mode uses #B798FF with dark foreground. Canvas/Files/Session/Skill handoffs, source setup, Messages member handoff/forwarding, Agent send and Coding Agent launch controls adopt the identity. Manual green primary, copy and cancel actions retain their existing identity. Build/TypeScript and public readback passed (1320690 bytes; SHA-256 `188ebe17d267166801abbe1132399c76a9700dd8c02037bd2c109e2f56ada919`). Targeted E2E `agents.handoff.visual-identity` final Round `20261009T055828Z-fb4ce92c`, Run `20261009T055634Z-77dd2eac`, passed all 38 assertions; ready handoff dialogs, contrast/color/icon checks, dark mode and Messages routes verified. Canvas/prompt and forwarding screenshots reviewed, owned Canvas archived and theme restored. No task dispatched to an Agent and no full frontend suite run.

### Manual primary restoration and Agent entry audit — 2026-10-09

Copy prompt is the green manual primary inside the shared handoff dialog. Generate icon via agent, Home Call my Agent, Create by my agent, session Prepare prompt and message-context handoff entrances use the shared purple supernova AgentButton. Manual upload, library generation, Save and cancellation retain manual styles. GUI 0.1.144-dev / promotion 0.1.196-dev published and normally installed; actual GUI endpoints confirmed 0.1.144-dev. Build/TypeScript and public readback passed (1320652 bytes; SHA-256 `7fb023cbf895334fd33c2bacb5f5e3a09dd2ad6ef88ea7637e49caea94680081`). Targeted agents.handoff.visual-identity Round `20261009T060712Z-4ca7bd63`, Run `20261009T060547Z-472cd0fa`, passed all 50 assertions: green Copy in four ready handoff dialogs, Home Call identity, real Channel icon handoff with manual actions preserved, shared handoff light/dark styles and Messages routes. Prompt and Channel editing screenshots reviewed. The earlier selector incorrectly read an inert background button while the modal was open; repair round preserves that failure. Owned Canvas archived and theme restored; no Agent task dispatched and no full frontend suite run.

### Home ordering and numbered activity pages — 2026-10-09

Home is banner → Recent activity → action guidance → scenario guidance. Empty successful activity results render no module or heading. GUI requests one 20-item numbered page, exposes exact total/range and numeric navigation, and replaces rather than appends rows. Server 0.1.6 adds membership-scoped count/offset windows and clamps out-of-range pages; old cursors remain compatible. Local Core forwards these query parameters without a binary change. Server release build/deployment/readiness passed. GUI 0.1.146-dev / promotion 0.1.198-dev published and normally installed, confirmed through both actual ui.json endpoints; public readback verified 2445828 bytes / SHA-256 `fb32b088d1af3f79cc05abd703bf7f5305037a828baca568257f87bb255cf04c`. TypeScript/build and two affected component test files (9 tests) passed. Targeted E2E `collaboration.home.activity` Round `20261009T063306Z-c71c7f8a` under Run `20261009T062942Z-7ded9d18`, with `--timeoutMs 180000`, passed all 72 assertions. Real empty Channel, exact 25 total, 20+5 page replacement, order, numeric active page, no body prefetch, legacy cursor and exact Canvas navigation verified; screenshots reviewed. All 25 owned documents archived, count returned to zero; one named empty fixture Channel is retained for reuse. Initial default-60-second run passed functional assertions but timed out during cleanup; two owned remnants were identified by its exact run prefix and archived before repair. No full frontend or full regression suite claimed.


### Official Home animation — 2026-10-09

GUI 0.1.147-dev / promotion 0.1.199-dev reuses the official website network component with three material cards, 1×/2×/200× captions, glowing edges and packet animation. Scoped styles add a dark-to-theme background fade and container adaptation; reduced-motion and hidden-document pause remain. GUI-only build, targeted component test and R2 exact public verification passed (1322269 bytes; SHA-256 `289ee800705862c9cca3a6075e90dd5552c564b7c86ed025149e2962f95a0f3b`). Normal installation confirmed active ui.json 0.1.147-dev. Read-only E2E `channels.home.hero`, Run `20261009T064721Z-9ecf2890`, passed official captions/cards, gradient, moving particles, reduced-motion pause and narrow containment; desktop and narrow screenshots reviewed. No product fixtures modified. Trace ingestion diagnostics are retained; no performance budget is claimed.

### Private enterprise integration placement — 2026-10-09

Repository-root `integration/` is Git-ignored. Enterprise component versions, distribution and Server deployment records remain independent from public release versions. Company-specific targets, scripts and evidence are retained only in the private directory; `integration.example` will be extracted after real implementation. Placement probes verified remote directories, isolated PostgreSQL 16 write/restart/read persistence and Blob file writes, a real GUI ZIP upload with curl Range/full size/SHA-256 readback, and an isolated fixed CDN path overwrite with unchanged URL. The database instance remains for subsequent deployment; its test schema was removed. Existing Linux Server binary transfer digest matched; native execution and bookworm runtime failed due to glibc, while a newer existing container runtime entered application configuration validation. This is not Server readiness, enterprise release, full installation/update, SSO or HTTP/WebSocket acceptance. Docker storage is full and needs capacity work before new builds/image pulls. No public channel or public component version changed.


### Softer Home gradient — 2026-10-09

GUI 0.1.148-dev / promotion 0.1.200-dev lightens the hero base to gray-green #303a33 and starts the fade at 38% of banner height with an intermediate theme mix at 68%. GUI build and immutable public readback passed (1322279 bytes; SHA-256 `deed0cb58f2941546dd6a612960e484c1dfd168e77c949da0ef3aededb0760a3`). Normal installation confirmed active ui.json 0.1.148-dev. Read-only E2E `channels.home.hero` Run `20261009T070009Z-33f24127` passed all seven assertions. Desktop/narrow screenshots reviewed; card contrast, particle movement and reduced-motion pause retained.

### Enterprise host capacity recovery — 2026-10-09

After explicit user authorization, unused Docker build cache was pruned; reported reclaimed space was 90.58 GB and the host data disk returned to 83% used with 82.5 GiB available. Existing images, containers and business volumes were retained. The pre-existing database recovered from disk-full recovery failures and passed pg_isready/container-health checks. Read-only storage investigation identified retained cumulative Agent state checkpoints as the dominant payload. Private project-specific evidence remains under ignored integration/. No database data, application code, release version or public channel was changed.


### Home card alignment — 2026-10-09

Removed the official hero third-card lift at both desktop and narrow container sizes. All three card tops/bottoms, SVG regions, multipliers and captions now share geometry. GUI 0.1.149-dev / promotion 0.1.201-dev built, publicly verified (1322253 bytes; SHA-256 `553ad9b4cb26e507ad41368523d3e0ab38c7fcbf2c35e163a2736f7eaa1b13fa`) and normally installed; active ui.json confirmed 0.1.149-dev. Read-only E2E `channels.home.hero` Run `20261009T072613Z-c5d6512f` passed nine assertions including explicit desktop/narrow geometry alignment, animation, gradient and reduced motion. Narrow screenshot reviewed.


### Home light surface — 2026-10-09

Removed the dark hero background and gradient. Hero uses the workspace surface; pale green/purple/lime cards and adjusted text/network contrast retain animation and equal geometry. GUI 0.1.150-dev / promotion 0.1.202-dev built, publicly verified (1322404 bytes; SHA-256 `d73649c4bcb881514d78af64794cd1c942a28ceb9fb85b59bb9876912ef2d644`) and normally installed, active ui.json confirmed. Read-only E2E `channels.home.hero` Run `20261009T081239Z-86e8e483` passed nine assertions including absence of a background gradient, desktop/narrow alignment, movement and reduced motion. Narrow screenshot reviewed.

## Enterprise SSO acceptance (2026-10-09)

- PASS: real KSAP RS256 signature/JWKS and exact deployment host, system-browser employee confirmation, PKCE exchange, existing account UUID retained, Core-owned SQLite session persistence.
- PASS: installed kwai-colab Skill workspace discovery before and after Core restart; one Kuaishou organization; existing workspace and Canvas visible.
- PASS: native enterprise GUI omits Google linking/reminder, account switch and organization switch. Public/enterprise AccountProfile tests (5) and default public GUI build pass.
- PASS: bridge negative tests (9), isolated PostgreSQL external identity/lease test, existing public Google profile preservation and device lifecycle tests. Expired enterprise lease blocks HTTP identity, refresh and device re-login; anonymous device creation and public Google login are denied by enterprise policy.
- PASS: company domain anonymous request redirects to SSO; direct bridge without identity is 403; company browser identity verifies.
- Evidence: ignored integration/kuaishou/evidence/sso-*. Public App/service hashes match earlier installation evidence; public receipt/discovery changed before enterprise candidate installation, so they are not claimed unchanged against that historical baseline.
- Not accepted: API HTTPS, live offboarding, immediate closure of already-open sockets on lease expiry, corporate Developer ID signing/notarization, Windows/x64.

Enterprise distribution verified: promotion 0.1.2-ks.1; Core 0.1.2-ks.1, GUI/Skill 0.1.1-ks.1, Shell 0.1.0-ks.1; Server 0.1.1-ks.1. Canonical --component local-core build used isolated enterprise versions/output. Unchanged immutable GUI/Skill/Shell reused exactly; signed CDN stable readback and installed update check pass. SSO account/Skill reads survive final Core update.

### Managed-profile validation (2026-10-09)

Verified 6 account UI tests, GUI type/build check, Server cargo check, 9 private bridge tests, isolated Postgres enterprise profile overwrite/rejection and public Google customization preservation tests. Real enterprise SSO refreshed corporate name/avatar into Core SQLite with stable UUID. Core-proxied name PATCH and avatar reset both returned 403. Installed native GUI displayed company-managed profile without edit controls; private Server and GUI independently advanced, other components retained versions. Enterprise directory API credentials/permissions and live search remain unverified.

### People selector validation (2026-10-09)

9 selected UI tests passed (public email invitation, enterprise keyboard identity selection/form reset, duplicates, errors and profile rules); GUI default type/build check passed. Server/Core cargo checks and isolated PostgreSQL directory provisioning test passed: unauthorized actor rejected, no login lease before SSO, stable first-login UUID, duplicate role unchanged and email collision rejected. 11 private bridge/adapter tests passed. dev01 production OpenAPI search and batch revalidation passed through installed Core; wrong provider/free email rejected (400), duplicate add preserved existing owner. Native GUI showed company photo/name/username/department and disabled already-added user. Installed signed CDN candidate independently upgraded Server, Core and GUI; Skill/Shell versions unchanged.

### Person selector layout acceptance (2026-10-09)

3 focused PersonSelect tests passed (keyboard/form reset, public email invitation, duplicates/errors); canonical GUI type/build passed. Installed private GUI verified visually: dropdown attached to input, selected photo/name/username capsule inside one field with no duplicate name row; clearing restores search. Only GUI advanced to 0.1.4-ks.1, promotion 0.1.5-ks.1.

Empty-search fix: 4 focused selector tests and canonical GUI build passed. Native empty focused field showed input guidance without error; signed candidate installed and accepted.

### Public/enterprise release isolation follow-up (2026-10-09)

- Completed Skill member addition: consult the Core profile identity policy; public invitations retain email semantics, managed profiles resolve an exact directory username/email and submit the verified identity through Core. Live enterprise duplicate self-add passed without changing the existing owner role; Browser tests (7) and GUI account/person tests (10) passed.
- Canonical builds now isolate GUI, codec, Rust target and Electron intermediate outputs beneath the selected artifact destination. Enterprise versions require a separate destination; existing component version directories are rejected instead of rebuilt. Public GUI build with an inherited enterprise mode variable passed using the public version; archive scan found no company domain/server address.
- Public component versions: Core 0.1.103-dev, GUI 0.1.151-dev, Skill 0.1.58-dev; Electron Shell unchanged. Final public archives are built after the source commit; installation validation remains user-owned.

- Enterprise build destinations are now required to resolve beneath `integration/.../artifacts`; canonical Kwai intermediates were moved into `integration/kuaishou/artifacts/build/canonical` and private input references updated. Public artifacts remain in root `dist`.

- Final public Core/GUI/Skill archives generated and checked: Core TAR payload hashes match packaged files; both public ZIP integrity checks passed; public GUI archive contains its public version and no company domain/server/enterprise version. Kwai Skill 0.1.2-ks.1 prepared separately under ignored integration artifacts. Installation-entrypoint tests (2) passed. No channel promotion or user installation performed in this public-artifact validation step.

- Public promotion 0.1.205-dev published through `packaging/publish-to-r2.sh --component local-core --component desktop-ui --component colab-skill --platform darwin`. New Core 0.1.103-dev, GUI 0.1.151-dev and Skill 0.1.58-dev were fully read back by curl and size/SHA-256 verified before promotion. Signed stable manifest, signature and installers were read back byte-for-byte. Existing Shell and Windows artifacts retained. User installation/behavior verification pending.

### Artifact deployment configuration (2026-10-09)

- Audited public service/distribution addresses: Channel invitation, Session invitation, Quick Share, Skill setup, macOS/Windows bootstrap and Windows shell seed were independent hardcoded defaults. Runtime source now consumes a deployment artifact configuration; concrete public values are in ignored `packaging/artifact-config.local.json`, enterprise values in ignored `integration/kuaishou/artifacts/config.json`. Checked-in `packaging/artifact-config.example.json` documents the fork contract.
- GUI embeds the selected configuration at build time; Skill includes `artifact-config.json`; both bootstrap scripts are rendered from templates. Setup emits Core environment from this configuration (including enterprise SSO requirement). Enterprise adapters no longer replace deployment URLs inside source or minified GUI. Build validation enforces deployment mode and separate enterprise artifacts destination.
- GUI person/account/invitation tests (12), installed Skill entrypoint tests (2) and setup/platform tests (8) passed. Windows native installation remains unexecuted on this macOS host.

- Configuration release accepted: public stable 0.1.206-dev (GUI 0.1.152-dev, Skill 0.1.59-dev) uploaded and fully curl-verified; Core/Shell/Windows artifacts retained. Enterprise stable 0.1.7-ks.1 (GUI 0.1.6-ks.1, Skill 0.1.3-ks.1) signed, installed and promoted after acceptance. Installed Skill JSON matches enterprise profile; launchd Server/manifest/SSO policy match; installed GUI has the company installer and no public artifact domain. Public installation baseline hashes unchanged by enterprise installation. No Windows native acceptance claimed.


### Canvas images — public R2 acceptance (2026-10-09)

- Released public promotion 0.1.208-dev: Core 0.1.104-dev, GUI 0.1.154-dev, Skill 0.1.62-dev; deployed Server 0.1.9. Canonical publisher verified artifact size/SHA-256 through public curl readback. Installed Core binary digest and GUI version were checked; authenticated actor alignment was retained. Electron Shell was unchanged.
- Canvas end-to-end Run 20261009T140617Z-8d3b5960, passing Round 20261009T141254Z-cb22068c: canvas.editing.images, canvas.editing.text-roundtrip and canvas.editing.agent-patch passed all 46 assertions. Image coverage includes upload failure/retry, native resizing, reload, picker/paste/drop, actual Agent interpretation/download CLI and text patches preserving image identities. Owned test Canvas was archived.
- Initial blocked round is retained: installation selected an empty macOS database. Installer repair preserves an existing configured database and recovers the authenticated legacy public database without importing accounts into enterprise/test roots. Normal installed update restored the original actor.
- Release end-to-end platform.updates.changed-only passed Run 20261009T141642Z-4e1dc409, validating changed-artifact installation in an isolated fixture.
- Production R2 readback verified all three test images against exact stored byte counts and SHA-256; all remained available after Canvas archive, consistent with delayed retention. Initial 2,929,365-byte PNG Put/Get/Head trial also passed and its owned trial object was removed.
- Codec checks: 13 passing cases, including image identity/geometry across text patch and Yjs replay. Real Tiptap replica attachment discovery passed; GUI type/build and Server/Core compile checks passed.
- Acceptance is macOS public deployment only. Kuaishou Blob infrastructure is being prepared separately; no enterprise Blob or Windows image acceptance is claimed.

### Canvas image placeholder acceptance (2026-10-09)

- GUI type/build passed. Canonical desktop-ui-only build and R2 publisher verified GUI 0.1.155-dev (SHA-256 e73cec775f69a82a29578ff8bd01b53f671a792c91f2c269162a1a9e33fbd31d); public promotion 0.1.209-dev installed and actual GUI /ui.json verified. Core remains 0.1.104-dev.
- End-to-end canvas.editing.images passed all 28 assertions in Round 20261009T150103Z-27cddfc6 of Run 20261009T145918Z-dd6cb3c1. Paused upload verified a visible skeleton inside the editor immediately after paste, no pending durable image node, and removal after real upload. Existing retry, resize, reload, drop, Agent interpretation/download and text patch coverage passed; owned Canvas archived. Skeleton and final screenshots visually reviewed.
- Initial failure retained: assertion counted ProseMirror's cursor separator image; repaired selector counts only img[data-canvas-image]. No product failure was hidden.

### Canvas full image rendering lifecycle acceptance (2026-10-09)

- GUI compile/build passed; canonical GUI-only R2 release 0.1.156-dev verified size 1,330,151 and SHA-256 82fbe14727cc9b3baf5b2794396506e3b0e517dbbc2002d9e54c9d6b4325827f. Promotion 0.1.210-dev installed; actual /ui.json reports 0.1.156-dev. Core/Skill/Shell retained.
- canvas.editing.images passed 32 assertions in Run 20261009T154431Z-f9fc5e9d. Independently paused POST upload and GET image content: local blob preview decodes before upload, remains visible and busy after successful upload while remote bytes are held, then disappears after the actual editor image renders. Durable projection contains no blob URLs. Existing image retry/resize/reload/drop/Agent consumption/text-patch checks also passed; owned Canvas archived. Delayed-response screenshot visually reviewed.

### Required identity onboarding (2026-10-10)

- Added a shared top-of-app, non-dismissible identity verification banner. Custom name/avatar and old reminder-dismissal settings do not suppress it. Binding Google or an authenticated managed enterprise profile removes it. Enterprise managed profiles are trusted because the Server only allows profile reads after validating the SSO session lease.
- Artifact config `auth.kind` selects the existing Core Google/external start endpoint; `auth.label` supplies the provider button label. No company-specific branch inside the banner and no separate GUI implementation. Focus refresh plus five-second checks while unbound observe browser-completed binding even if account ID/email stay unchanged; stale profile responses cannot cross account changes.
- Onboarding (4), AccountProfile (6), invitation (2) tests and GUI TypeScript check passed. Only GUI artifact versions advance; Core/Skill/Shell remain independently unchanged.

- Onboarding published: public stable 0.1.211-dev with GUI 0.1.157-dev; all other artifacts retained from the current stable channel. Enterprise stable 0.1.8-ks.1 with GUI 0.1.7-ks.1 installed and promoted after client acceptance; actual profile is managed/SSO-authenticated, and installed GUI includes the common onboarding plus configured company provider label. Public installation baseline unchanged by enterprise installation. Google browser login itself was not repeated; its existing start flow is reused and banner transition was tested with a linked profile.

### Canvas sync recovery and diagnostics — 2026-10-10

- Released promotion `0.1.213-dev`: GUI `0.1.159-dev`, Local Core `0.1.107-dev`; deployed Server `0.1.12`. Electron Shell and Skill unchanged. Canonical R2 publisher verified artifact sizes and SHA-256; normal updater installed the changed artifacts; server readiness passed.
- While Canvas is offline, GUI reconciliation retries after 3 seconds with backoff capped at 30 seconds. A successful Core reconciliation clears the stale error and Offline status without another edit, navigation or WebSocket event. Core retains ownership of durable outbox retry and ordered repair. Empty upstream error responses now retain the HTTP status in the diagnostic message.
- `canvas.edit` and `canvas.reconcile` traces retain Canvas/update IDs, update byte count, trigger, stage, HTTP status, cursor, pending count and recovery outcome through an explicit ingestion allowlist. Document and image contents are not captured.
- E2E `canvas.recovery.state`, Round `20261009T161453Z-5a2e81ff`: 10 assertions passed. Real edit forwarded to Core before a simulated lost response; after restoring transport, no additional edit/navigation was performed. Screenshots confirm Offline/error disappears and Synced returns; projection remains intact, pending outbox is zero and owned Canvas cleanup completed.
- Cloud readback verified error trace `ca67d0b6d11e8d1e31c9124ef414fd29` (`edit-failed`, `offline`) and recovery trace `ec01a4e2ccf7e68fe1c7a1e4847cdcc1` (`offline-retry`, HTTP 200, `recovered`, `synced`, recovered=true). Recovery spans include GUI, Core and Server. The runner reported ingestion deadlines for nine other traces; this does not constitute complete telemetry acceptance for those traces.
- Rust ingestion tests: 2 passed, including preservation of Canvas diagnostics and stripping document/secret attributes.

## Feedback collection feasibility (2026-10-10)

Local Codex CLI 0.155.0 trial verified Skill read/command hook evidence, Stop-time user-to-final-response transcript capture, and ephemeral exec/fork without persisted rollout or local thread DB rows. No feedback product implementation or upload is complete. Desktop host hooks/sidebar, multi-turn segmentation, compaction completeness and durable async handoff remain unverified. Evidence and scope: `.trial/V-FEEDBACK-01-codex-hooks/README.md`.

### Desktop feedback probe (2026-10-10)

Actual current desktop thread uses bundled Codex 0.162.0-alpha.2. Installed Skill read and explorer help succeeded; a previous completed turn was extracted from this same desktop transcript with query/final assertions. A new thread-scoped PostToolUse/Stop probe is registered but has not fired in the active turn; host reload/trust review remains pending. No upload, desktop live-hook success, ephemeral sidebar acceptance or production feedback completion is claimed. See `.trial/V-FEEDBACK-02-desktop-hooks/README.md`; trial-only hooks can be removed with its restore.py.

### Desktop feedback live hooks accepted (2026-10-10)

Supersedes the preceding pending probe status: real current desktop thread delivered PostToolUse for installed Colab Skill read/explorer invocation and Stop for the preceding turn. Stop transcript range verified actual user query, exact final response, 13 tool calls and 13 results. Capture required no inference/fork/upload/new thread. Trial hooks removed preserving unrelated hooks. Ephemeral desktop listing and background inference remain unverified. Evidence: `.trial/V-FEEDBACK-02-desktop-hooks/README.md`.

### Feedback design review (2026-10-10)

`docs/feedback-design.md` records proposed objective bundles, provenance, consumer-local evaluations, raw upload, producer tools and GUI. Existing CLI/desktop hook evidence was reread; managed installation code confirms path/revision receipts but no installation-channel provenance persistence. Native Skill activation, untrusted-hook scanner fallback, prior-three-human-query extraction and desktop ephemeral analysis remain acceptance gaps. This is a design deliverable, not product implementation or release.

### Feedback design revision (2026-10-10)

User rejected Core Session scanning: the design now requires authorized/trusted hooks, with no silent fallback capture/upload. Skill identity uses assetKey/channelKey; default GUI/Agent analysis aggregates by assetKey. Producer interfaces are owner asset statistics, filtered/projected feedback lists, existing Session Reader with proposed feedback-ref adapter, and processing-state mutation. Evaluation names are rating/taskTrajectory; negative tags require explicit selection criteria and evidence. Design-only; no new runtime acceptance claimed.

### Feedback status and command semantics (2026-10-10)

Design correction: feedback resolution states are unresolved/resolved/ignored, with reasons, evidence references and audited transitions; resolved means the problem was actually solved, not merely reviewed. Commands use list-assets/list-feedbacks/update-feedback-status with shared asset scope and status filters. No runtime implementation or validation claimed.

Feedback design vocabulary correction: rating values and statistics use positive/negative/unrated; resolution counts use resolved/unresolved/ignored. Replaces prior up/down and processed/unprocessed terminology. Documentation only.

Feedback design simplified: consumer evaluation is Markdown with an embedded YAML block (rating/taskOutcome/tags/taskTrajectory); tag evidence and trajectory descriptions are free text. Removed confidence/limitations/findings/customTags questionnaire. GUI is Skill preview feedback-count entrance, list and Markdown rendering without filters. Consumer and producer analysis prompts are now explicit. Design only; runtime unchanged.

- Kwai Skill discovery metadata corrected (2026-10-10): installed `~/.agents/skills/kwai-colab` and SKILL name already existed, but Codex `agents/openai.yaml` still advertised Agent Colab and `$agent-colab`. The ignored enterprise derivative now emits display name Kwai Colab and `$kwai-colab`. Skill 0.1.4-ks.1 packaged, uploaded, installed, metadata inspected and accepted; enterprise stable 0.1.10-ks.1 promoted retaining current Core/GUI/Shell. Public Skill installation unchanged.

### Configured Skill identity templates (2026-10-10)

- Skill names and presentation now come from artifact config `skill`: name, displayName, description, shortDescription, brandColor and defaultPrompt. Original SKILL.md and agents/openai.yaml contain explicit template fields. The canonical builder and ignored enterprise derivative use the same renderer; company-specific metadata replacements were removed.
- Agent target directories, default application state roots and managed service labels derive from configured Skill identity. Artifact metadata retains the independently owned artifact version. Historical public migration paths remain explicitly historical and retain their existing ownership guards.
- Canonical public and enterprise Skill test builds passed. Enterprise ZIP contains configured metadata, the correct independent version, and working packaged setup with isolated kwai-colab state root. Rendering tests (3) cover public, company and third-party names plus frozen-template derivation; platform tests (8) and installed-entrypoint tests (2) passed. Original templates are frozen as .in files inside each package; enterprise derivatives render those templates from their input artifact, not newer source HEAD. No release channel changed for these build-rule checks.

### Skill Feedback acceptance — 2026-10-10

- Core capture/consent/identity/queue tests pass; existing Session projection tests: 16 pass, 2 integration tests ignored.
- Isolated Postgres feedback tests pass, including zero-feedback assets and atomic stale-revision rejection.
- GUI feedback tests pass (2); TypeScript/Vite and changed component builds pass.
- Skill feedback tests (3), installed entrypoint tests (2), parser/trace tests (3), and Trace registry check pass. Packaged Skill resources/ZIP verified.
- Desktop bundled Codex 0.162.0-alpha.2 ephemeral evaluation: zero new thread rows and rollout files.
- Trace Run 20261010T024724Z-ba31f69e: feedback transport 1 passed / 12 assertions; real isolated Core/Server, synthetic evidence only, owner scope and digest corruption checked. Case reviewed and qualified active.
- New production hook registration/trust and a fully installed GUI acceptance run have not been performed. No real conversation upload or production deployment occurred. See `.trial/V-FEEDBACK-03-implementation/README.md`.


### 2026-10-10 — organization-person mentions

Verified: UI TypeScript check; Server and Local Core cargo checks; 16 focused frontend tests across organization-people, PersonSelect, UserIdentity invitation behavior, AgentMessageComposer serialization and MessageTimeline; isolated colab_sso_acceptance PostgreSQL directory test including persisted username, organization search, provider/subject membership resolution and cross-organization rejection. Core cargo check reports the existing unused proxy_json warning. Live desktop/server/CDN release acceptance remains pending; no production promotion was made.

### Message draft retention — 2026-10-10

Message composer now saves the full Tiptap document locally per authenticated account and stable Channel ID, preserving formatting and immutable mention identities. Navigation/unmount and page reload restore the draft; only a successful submit or explicitly emptying the editor clears it. Failed sends retain the input. Storage failures fall back to an in-memory cache. This is GUI-only; existing server-backed sent messages remain unchanged.

Validation: clean isolated GUI `0.1.162-dev` artifact built successfully. End-to-end Run `20261010T031624Z-1ee846d1`, `communication.messages.draft`: seven assertions passed for navigation, reload, failed-send retention, real successful submit and post-reload clearing. Screenshot reviewed. Initial Run `20261010T031456Z-16fa6607` failed because an empty contenteditable reads as a newline; fixed the empty assertion and preserved its evidence. Focused serializer/draft identity tests: four passed. Public promotion `0.1.216-dev` updates GUI to `0.1.163-dev` only. The initial immutable `0.1.162-dev` URL had a cached pre-upload 404; a fresh version passed canonical curl size/SHA-256 verification without changing feature code.

Installed acceptance: the concurrent normal updater installed GUI `0.1.163-dev`; the live GUI proxy `/ui.json` reports that version and every installed GUI file matches the published build byte-for-byte.

2026-10-10 Feedback deployed acceptance: Server 0.1.13 activated with migration/readiness; Core 0.1.110-dev and Skill 0.1.64-dev installed. Actual Desktop-bundled Codex invocation-scoped hooks captured builtin and naturally read managed Skill tasks, with previous three human queries; raw and two ephemeral Markdown evaluations uploaded, zero analysis threads. Producer queries, Reader and ignored revision update passed. Global capture restored disabled; GUI 0.1.165-dev published/installed; actual Desktop counted entry, YAML/Markdown, status and original task preview passed. See `.trial/V-FEEDBACK-03-implementation/README.md`.

### Trace account attribution — 2026-10-10

Implemented optional account UUID `user.id` for GUI/Skill entrance spans and Core/Server authentication-helper spans; the relay validates and preserves per-span IDs. GUI captures identity at operation start, clears on logout and guards delayed initialization against overwriting a newer auth state. Skill resolves identity from Local Core config. Industry report uses GUI+Skill entrance trigger counts and known-user deduplication; historical identity remains unknown. Trace instrumentation/analysis skill guidance was updated outside the repository.

Verified locally: GUI TypeScript check; focused GUI tracing tests (5 passed); Rust observability tests (8 passed, including mixed-account OTLP preservation and invalid-identity removal); Core and Server cargo check; Python tracing registry tests (3 passed) and command identity isolation test (1 passed). Backend historical readback at 2026-10-10 11:33 Beijing: GUI 49,135 observed operation spans, Skill 16, total 49,151; no user attribution available. Source metadata implementation is not yet released/deployed; actual packaged GUI/Skill and cloud user.id readback remain pending. No production UV coverage is claimed.

Final Feedback release acceptance 2026-10-10: Server 0.1.14 readiness and binary hash readback passed. Promotion 0.1.220-dev installed Core 0.1.112-dev / GUI 0.1.167-dev / Skill 0.1.64-dev, Shell unchanged. Filtered producer query, Markdown comment, raw Reader with three prior queries and final reply, and disabled hook bypassing transcript access passed on the final installation. Source committed; immutable Server release guard rejects a real same-version conflict before upload/restart. Test-only feedbacks ignored; test parent archived; capture disabled.

### 2026-10-10 runtime callback/recovery validation

Verified native `thread/turns/list` exposes exact request client IDs for both
reported tasks. The first request already has an interrupted turn plus a later
completed retry, demonstrating the old replay risk. Tests verify identity matching
rejects unrelated turns and prompt-text guesses; a fake real app-server exercises
foreign-writer completion/interruption without notifications or resubmission.
Artifact tests render public and independent company bootstrap/Skill configurations
and execute installed setup identity loading. Installed-client recovery and
production promotion remain pending.

Installed verification completed (2026-10-10): Core tests 46 passed / 2 ignored;
Server API tests 14 passed / 2 ignored; artifact rendering/installed-identity tests
4 passed; installed Skill entrypoint tests 2 passed; GUI handoff tests 6 passed.
Foreign-writer tests also instantiate a fresh manager to recover existing native
history without queue submission. Public and enterprise Canvas prompt previews
both expose semantic templates and bind executable commands to their own installed
Skill/discovery paths; previews created no tasks and mutated no Canvas content.
Public and company organization search return resolved member identity.

Enterprise requests b8cfaea4-6993-4dd2-b630-8c5a0c825a44 and
 ef110a8a-22a6-4812-9e33-e2840ab5de66 are both succeeded. Their remote work records
contain native final answers (6 and 11 events), journal status completed/reported,
and installed kwai-colab request-context reads exit 0. No callback summary was
manually backfilled into Channel messages. Evidence lives in ignored
integration/kuaishou/evidence/client/runtime-recovery-acceptance.json,
runtime-prompt-binding.json and client-acceptance.json. Packaged Skill comparison
found 497 program files byte-identical across variants; differences are configuration,
rendered metadata, independent package version and signer trust. Native GUI visual
validation was not resumed, at the user's request. Windows Core was retained and
is outside this installed macOS acceptance.


### Catalog error recovery — 2026-10-10

Catalog action failures now decode nested Core/Server envelopes, can be dismissed,
clear on navigation and expire after 8 seconds. Read failures remain visible with
a real retry action. Navigation invalidates delayed action failures; disposed
Catalog read requests cannot publish errors into the next view. Successful Session
source reads/shares clear previous failures, and reopening Forward to Agent starts
with a fresh error state. GUI 0.1.170-dev contains the final change; Core and Shell
are unchanged. Focused decoder tests passed (2 tests), production GUI build passed,
and end-to-end run 20261010T063417Z-5a67dbcb passed 8 assertions using the actual
Core with a controlled rename 403 matching the reported envelope. Dismissal,
navigation, expiry and durable fixture cleanup were verified; screenshot reviewed.
This verifies notice recovery, not the cause of the original authorization denial.

Release acceptance: signed promotion 0.1.224-dev published through the canonical
R2 publisher; immutable GUI ZIP public readback verified SHA-256
`e323b7ab60d9b5dcc46825797a732c722f73d0f8c7f8515d02c053bb9c640eda`
and 1,335,487 bytes. Normal updater installed GUI 0.1.170-dev; all 39 installed
files match the clean release build, and live /ui.json reports the same version.

### Canvas missing dependency regression (2026-10-10)
Real enterprise Canvas f19779cd-dffb-4dcc-954f-ce9d825a1955: installed Skill read returned newline at cursor76; fresh replay of all76 Server updates yielded4746 characters with no pending dependencies. Codec tests14 passed, including dependent-only update refusal and idempotent baseline repair. SQLite production save helper verifies stale callers retain both updates and upload ACK does not advance cursor. Enterprise13/Core9 installed acceptance passed; real installed Skill returned4746 characters (SHA2563562e9d8fdd1e88dcf55960fc2e354cab0d767936f353353889f3a73e6de1877), seq76/synced; no Server content mutation. Enterprise install preserved public installation hashes. Evidence: ignored integration/kuaishou/evidence/client/canvas-recovery-acceptance.json. Both stable channels promoted; macOS arm64 only. Public225/Core116 installed acceptance passed: authenticated existing account and nonempty existing Canvas read/synced. GUI/Shell/Skill versions retained.


### Compact Canvas references — 2026-10-10

Core 0.1.117-dev projects mentions as readable `colab:<kind>:<stable-id>` links
instead of Base64 editor attribute capsules. GUI 0.1.171-dev renders compact and
legacy links consistently in Agent work details. Existing CRDT documents need no
migration; protected editor metadata is recovered from the authoritative replica
when applying patches. Legacy excerpts remain patchable. Codec tests passed
16/16, covering repeated mentions, exact occurrence preservation, escaped labels,
legacy parsing/patching, protected identities and Yjs replay. Clean Core and GUI
production builds passed. Shell and Skill are unchanged.

Operation Workbench implementation 2026-10-10: independent frontend, Settings entrance, authorized Skill feedbacks, independent updater and Core hosting. Feedback tests 3; setup tests 3 (selective update, malformed package recovery, legacy manifest); publisher tests 4 passed. TypeScript/Core check passed. Publication and installed acceptance pending; `.trial/V-WORKBENCH-01/README.md`.

### Canvas local text and verified reference editing (2026-10-10)
Reproduced the real planning document's lossy-list guard failure. Inline text edits now use ProseMirror transforms with exact projection-context checks and preserve surrounding tree/marks/trailing spaces. Added replace-with-canvas through Skill→Core: validate both Canvas IDs in the same authorized Channel, check read revision, and insert the target's authoritative title/identity. Text patches still refuse capsule identity and structured-component edits. Fixed another ACK cursor advance in the patch path. Codec20 tests passed; clean frozen Core48 passed/2 ignored; Skill Canvas2 and installed entrypoints2 passed. All ten real planning substitutions passed against copied canonical state, including contextual Darwin disambiguation. Public230/Core120/Skill68 and enterprise15/Core11/Skill7 installed release acceptance pending.


Compact mention release acceptance: Core 0.1.117-dev and GUI 0.1.172-dev
are published and installed. Canonical R2 readback verified complete immutable
archives: Core SHA-256 `e35a378f5f326486e875af233b5af228a4d56fbf610002a2249fc13c6af644ac`
(46,012,597 bytes), final GUI `44d4da1734c2f985463e06c206d5e998db9986a9753b9c43832985f10ff807d4`
(1,335,596 bytes). Installed Core 4 files and GUI 39 files matched the clean builds;
discovery PID 84768 executed versions/local-core/0.1.117-dev/colabd and live
GUI /ui.json reported 0.1.172-dev.

All supported mention types were audited: member/user, Agent and files/session/
canvas/message resources. The shared codec emits compact references for each;
GUI context assembly accepts each resource kind and retains deduplicated reading
instructions, with legacy compatibility. Messages/forwarding and Server prompt
projections already avoid encoded editor capsules. Focused context/composer checks
passed 7 tests. Real end-to-end Round 20261010T071210Z-bea6d63c passed 21 assertions: GUI
insertion, Agent CLI compact read, adjacent Agent patch, original identity/label,
Files resource projection and handoff reading instruction, reload and durable
owned cleanup. Screenshot reviewed. Original proxy-port/script-selector failures
and default-timeout round remain recorded; this expanded case uses 120000 ms
execution allowance, not a performance budget.


### Enterprise compact mention release — 2026-10-10

Enterprise promotion 0.1.16-ks.1 is promoted and installed through the company
CDN stable channel. Core 0.1.12-ks.1 and GUI 0.1.11-ks.1 are built from the
verified compact-reference source 60a36bd, with enterprise configuration and
independent versions. Skill 0.1.5-ks.1 and Shell 0.1.0-ks.1 retain the previously
promoted bytes. Server is unchanged. Full CDN readback verified Core SHA-256
`6298c1e60999bafefc1db3a2d308af59f498f2f0eea1287f0942a96bbd98ab52`
(45,824,394 bytes) and GUI
`58f22b640ba759ba651b4a72352196d8782bb9613bf91f74f605bdc695b79793`
(1,331,990 bytes). The signed candidate, normal stable update and installed-client
acceptance passed; live Core executable is versions/local-core/0.1.12-ks.1/colabd.

Enterprise functional acceptance exercised real GUI member mention insertion,
compact Core Markdown, installed kwai-colab Skill read, adjacent text patch and
reload retaining identity. Owned test Canvases were deleted, screenshot reviewed,
and public installation isolation checks passed. Evidence and repeatable acceptance
entry are integration/kuaishou/evidence/client/compact-mentions-acceptance.json
and integration/kuaishou/artifacts/build/accept-compact-mentions.mjs.

An overlapping publisher reused candidate promotion 0.1.15-ks.1 and replaced
its manifest; receipt mismatch detected this before promotion. Fresh owning
versions and promotion 0.1.16-ks.1 were allocated. Enterprise publish/promote
now share one host-wide publisher lock across checkouts; promotion rejects an
older channel version or the same version with different content. An explicit
COLAB_RETAINED_COMPONENTS list can guard unchanged components during promotion.
These are local single-host safeguards, not cross-host CAS or global immutable
version reservation. Company signing/notarization and Windows are outside this
macOS arm64 acceptance.


## Operation Workbench installed acceptance (2026-10-10)

Settings opens an independent frontend artifact; Skill Feedbacks includes authorized shared assets and builtin Agent Colab. Published and installed Workbench 0.1.3-dev with GUI 0.1.173-dev. Desktop validation passed asset counts, Markdown/YAML comments, prior-three-query raw Session reader and real update check. Workbench-only update preserved Core PID and other component versions. No-auth API 401 and invalid Host 400 verified. See `.trial/V-WORKBENCH-01/README.md` for versions, digest and test scope.

### Canvas editing release acceptance completed (2026-10-10)
Public Core120/Skill69 published through the canonical R2 publisher and installed (promotion234); frozen enterprise promotion16-ks.2/Core12-ks.2/Skill8-ks.2 published through company CDN and installed. Existing GUI/Shell retained. Both installed CLI fixtures passed text edits, native Canvas reference replacement and reference read commands; owned test documents archived. The actual planning document's ten project names were replaced through the installed enterprise CLI. Full ProseMirror tree comparison confirms only those ten substitutions, preserving existing people, marks, spaces and outcome notes. Invalid target/stale revision rejected. Verified installed Core binary against archive payload, not receipts alone. Enterprise installation preserved public baseline hashes. Evidence is ignored integration/kuaishou/artifacts/build/profiles/canvas-editing/evidence/client/canvas-reference-acceptance.json. Tests: codec20, clean Core48 passed/2 ignored, Skill Canvas2/installed-entrypoints2/compact-context2. macOS arm64 only; native visual acceptance remains user-owned.


### 2026-10-10 — Inline mention typography

Chrome computed-style verification passed for member, Agent, Canvas and Files references in 14px, 16px and 24px text: font size/weight/line-height match surrounding text and resource icons measure 1em. This is a browser style check, not an end-to-end business regression. Shared checkout build initially blocked by dangling dependency links to a deleted temporary release directory. An isolated copy with independent dependencies passed TypeScript and Vite build; shared dependencies were left untouched.


### 2026-10-10 — Mention typography release acceptance

Public promotion 0.1.235-dev / GUI 0.1.174-dev and enterprise promotion 0.1.17-ks.1 / GUI 0.1.12-ks.1 are promoted and installed on macOS arm64. Source f20c99c; frozen build contains only GUI owning-version changes. Core, Skill, Shell and Workbench retained from each current channel. Public GUI SHA-256 4980492379ba9752791f96502da21b3fcc57b483c0d4af26ba2a941c32ad373d (1,336,599 bytes). Enterprise GUI SHA-256 3956aa2f75e1f72c4dcbbcfe53b7d72d05157718de4331597a8e3660bdbf0f4a (1,332,795 bytes). Canonical public R2 and company CDN full readback passed. Actual public /ui.json and all 41 installed archive entries match. Enterprise installed-client acceptance passed; real Canvas member mention inherits surrounding font size and weight, compact Agent CLI read, adjacent patch and reload passed, owned Canvas a7494725-100e-4ed3-ac5a-15292bbfab4e deleted. Screenshot inspected. Evidence: ignored integration/kuaishou/artifacts/build/profiles/mention-typography/evidence/client/. This used existing installed browser acceptance, not a Trace regression Run.
