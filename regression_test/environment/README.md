# Test environment parameters

`environment.local.yaml` is an ignored resource binding file. Case scripts consume `ctx.parameters` and `ctx.resources`; they do not open the file themselves. `REQUIREMENTS.parameters.keys` is checked before execution. Missing resources produce **Blocked**, never a passing result.

Use IDs for actors and resources, paths for owned source fixtures, and URLs/discovery files for clients. Keep authentication in each client's private discovery state. Do not put tokens or cookies in this file.

```yaml
parameters:
  channel: DISPOSABLE_CHANNEL_ID
  agent: OWNED_ONLINE_CODEX_BLUEPRINT_ID
  disposable: true
  secondDisposableChannelId: ANOTHER_OWNED_CHANNEL_ID

  # A different logged-in member, not another tab of the first member.
  secondMemberEmail: test-member@example.test
  thirdMemberEmail: existing-org-member@example.test
  secondCoreDiscoveryFile: /private/second-client/discovery.json
  secondClientBaseUrl: http://127.0.0.1:SECOND_CLIENT_PORT/

  # An actual anonymous Core can receive Quick Shares without membership.
  anonymousCoreDiscoveryFile: /private/anonymous-client/discovery.json
  nativeChooserBoundary: fixture

  # Only an explicitly disposable client can be logged out or restarted.
  isolationConfirmed: true
  isolatedCoreDiscoveryFile: /private/isolated-client/discovery.json
  isolatedClientBaseUrl: http://127.0.0.1:ISOLATED_CLIENT_PORT/
  secondAccountId: SECOND_SAVED_USER_ID
  testIdentityEmail: test-owner@example.test
  secondOrganizationId: SECOND_ORGANIZATION_ID
  disposableDeviceId: DEVICE_ALLOWED_TO_BE_REVOKED
  disposableSkillTarget: codex

  # Control transport or process lifecycle only; assertions remain in cases.
  # File retry requires a publication-only fault, retaining CRUD connectivity.
  # realtimeControl disconnects only the receiver's realtime connection.
  # runtimeControl controls a disposable real Codex runtime, never a fake runtime.
  networkControl:
    disconnect: {executable: /absolute/path/to/test-control, args: [publication, off]}
    connect: {executable: /absolute/path/to/test-control, args: [publication, on]}
  coreControl:
    restart: {executable: /absolute/path/to/test-control, args: [isolated-core, restart]}
  runtimeControl:
    disconnect: {executable: /absolute/path/to/test-control, args: [test-runtime, off]}
    connect: {executable: /absolute/path/to/test-control, args: [test-runtime, on]}
  realtimeControl:
    disconnect: {executable: /absolute/path/to/test-control, args: [receiver-realtime, off]}
    connect: {executable: /absolute/path/to/test-control, args: [receiver-realtime, on]}

  # Signed release fixtures are real manifests, not a replacement installer.
  releaseManifestUrl: https://YOUR_ARTIFACT_ORIGIN/channels/stable.json
  testServerUrl: https://YOUR_TEST_SERVER
  baseManifestUrl: https://YOUR_TEST_ARTIFACT_ORIGIN/base.json
  singleComponentManifestUrl: https://YOUR_TEST_ARTIFACT_ORIGIN/ui-only.json
  changedComponent: desktop-ui
  tamperedManifestUrl: https://YOUR_TEST_ARTIFACT_ORIGIN/tampered.json
  unhealthyManifestUrl: https://YOUR_TEST_ARTIFACT_ORIGIN/unhealthy.json

  # Malformed-object contract fixtures must be published on the test server.
  unsafeMaterializationFixtures:
    - {kind: traversal, shareId: MALFORMED_SHARE_ID, outsideSentinel: /private/test/sentinel.txt}
    - {kind: symlink, shareId: ESCAPING_SYMLINK_SHARE_ID, outsideSentinel: /private/test/sentinel.txt}
  diagnosticLogFiles: [/private/test/client.log, /private/test/server.log]
```

Source/content bindings (`filesRef`, `sessionRef`, `skillRef`, `canvasRef`, expected text, source paths) are supplied by fixture preparation or the operator. The example profile lists these fields. `support/prepare.py CHANNEL_ID` creates an owned Session fixture and prints non-secret binding values. `support/prepare-browser.mjs` creates Canvas and ambiguous-name fixtures through the actual client; it uses the installed Trace browser runtime. Both require an explicitly disposable Channel.

The current native chooser fixture supplies only the OS-selected path. The GUI then performs actual inspection, registration, publication, authorization and consumption. It does not validate the operating system's file chooser UI.

The installer adapter redirects only installer destinations into `.fixtures/<run>/<case>/installation` and disables service registration. The product installer performs actual downloads, verification, extraction and activation. The health probe starts the downloaded Core with an owned database/discovery path, then terminates that process. Nothing is installed over the daily client.

When reusing a Files binding, check that the selected client is its contributor and `currentRootOid` exists. Fixtures stored under an ignored project directory need their own source-ignore boundary; `support/fixtures.mjs` initializes an empty fixture Git repository for this purpose. This never changes the outer project's ignore rules.

Optional `archiveCache` and `archiveCacheHashes` select previously downloaded immutable archives. The adapter verifies each selected blob's SHA-256 before copying it into the new installation's private cache; the product installer still validates manifest metadata, extracts and activates the artifacts. A cache-backed installation proves installation/health behavior, not cold network throughput.

Owned GUI fixtures bind testUserId and testOrganizationId before navigation. Account/Organization switching inside a case is restored afterward; one case must not change the next case’s resource scope. Revocation cases require a newly linked disposableDeviceId/revocableCoreDiscoveryFile for each execution; previously revoked sessions are not a fresh fixture. Never substitute a same-owner receiver for a distinct-member permission scenario.
