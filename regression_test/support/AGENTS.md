# Project regression script support

Keep this directory project-owned. The generic Trace skill must not import it or assume Colab endpoints.

client.mjs calls the packaged Python tools or the real Local Core. core.py reuses private discovery authentication; an optional secondCoreDiscoveryFile selects another already authenticated client without exporting its bearer. Cases must obtain all selected resources and parameters from ctx, never read a second environment file.

agent.mjs submits real requests and requires the registered runtime to reach succeeded and write a request-bound result. Codex work events expose the provider thread identifier; prompt.py reads only that test thread's actual user input. Suppress persisted command output for assembled prompts; do not dump unrelated sessions or credential-bearing content.

A disposable flag is an operator assertion about the configured fixtures, not proof of isolation. Create new objects with run-specific names. Existing-object destructive cases require explicitly bound disposable resources and, where relevant, a second client. No daily account logout, runtime interruption, installer activation or membership changes are implicit in using the production server.

Do not add empty runners to make the catalog say implemented. A script export alone does not establish complete variation coverage or successful validation. Keep pending implementation and actual non-green results in the status documents.

Case independence: shared read fixtures must survive the suite. Withdrawal cases create their own targets. Every created Canvas has a case-specific name; browser locators select the Canvas tree rather than matching both the tree and title. Type real mention queries one token at a time and resolve the candidate label inside its button; owner descriptions are part of accessible button names.

The real installer is loaded in installer.py with bounded destination constants and --no-restart. installation_health.py starts only that newly downloaded executable with owned state paths. Process controls supplied by environment parameters may manipulate isolated process/transport lifecycle, but must not supply substitute test assertions or business execution.

Quick Share capabilities are passed through stdin with capture:false. transfer_cli.py invokes the actual packaged CLI in-process so its parser sees the capability without exposing it in OS arguments. Never screenshot a secret-bearing handoff prompt or persist capability output.

Verification refinements: await persisted runtime events and request-specific rendered reply IDs after reload. A provider thread UUID is not the source catalog's filename-stem threadId; resolve its exact .jsonl filename suffix and require one match. Skill handoff must wait for installation-state loading before opening the prompt. Base UI controlled checkboxes commit asynchronously: click, then verify the durable selection rather than assuming synchronous uncheck.

Owned Files fixtures initialize an empty Git repository inside their ignored fixture directory, bounding source ignore rules so the project's outer `.fixtures` ignore cannot exclude every test file. Verify contributor identity and a published root before consumer tests. A previously registered share is not sufficient proof of a usable fixture.

Mutating a common read fixture must restore its exact prior bytes/projection in finally; test repetition is part of script verification. File preview selectors belong to the named tree, not global filename text shared with breadcrumbs. Preview variations create a case-owned share, report text/image/unsupported/corrupt-format assertions independently, and withdraw only that owned share.

Real multi-client preparation uses prepare-clients.py and supported device authentication/invite-link APIs. Distinct-member policy tests use secondMemberCoreDiscoveryFile; synchronization consumers use secondCoreDiscoveryFile. Never equate a cloned owner's client with a distinct identity. Owned auth state stays 0600 in ignored .fixtures. Copy only account/session state when linking another client, not daily sources, jobs, devices or runtime IDs. A separate revocable client prevents the revocation test from breaking later consumer tests.

fault-proxy.py provides a scoped loopback transport fault, forwarding actual Server bytes and rewriting only the upstream Host. WebSocket interruption is distinct from publication faults; CRUD must remain available during publication retry. manage-owned-core.py creates only personal.colab.regression.owner, so restart/offline tests never target the daily launchd label. test-control.py controls that job and owned proxy state. Browser pages for separate Core origins use separate contexts and the Core's existing private loopback credential; credentials are never in URL or test output.

prepare-hostile-fixtures.py creates real hostile Git packs and publishes them through the real Server transport using the authenticated account's private credentials in memory. It never bypasses authorization. The consumer case exercises materialization denial and an owned external sentinel. prepare-release-fixtures.py signs local candidate manifests with the existing publisher key; only candidate manifests/artifacts are served, never the key. These are test fixtures, not stable-channel promotion.

Current device-login case tests the product's device-backed chooser, not Google linking. Optional Google linking requires separate provider/browser acceptance; do not claim it qualified from device login.

All state-changing cases must restore the precondition in finally even when an assertion fails. A failed logout must not leave the shared owned actor signed out. Verify running binary/wire contracts after installer cases; an on-disk link or version label alone does not prove the active process is the repaired build. Fresh-fetch authorization checks require an authenticated client without prior materialization; retained local bytes are a separate assertion. GUI controls must be taken from actual rendered component semantics, not guessed checkbox/button roles.
