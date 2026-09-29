# Colab Skill

`colab-browser` implements the same Local API use cases exposed by the collaboration GUI: Channel discovery/create/update, member list/add/update/remove, Files/Session/Skill sharing, Shared Item discovery and owner withdrawal. Keep this as one shared-resource protocol instead of recreating per-type CRUD clients. Session content belongs to `colab-session-reader`; Skill installation belongs to `colab-skill-tool`; expiring context outside Channel membership belongs to `colab-transfer`.

The top-level `SKILL.md` must expose the full human/Agent story lines, not merely state that generic sharing exists: local Session search, Files/Session sharing, Files use, Session read, and owner withdrawal all require directly executable examples. Treat missing Skill instructions as a missing Agent capability even when an undocumented subcommand happens to exist.

Follow `docs/agent-interface.md`. `bin/colab-browser` handles Channel discovery and Files use. `bin/colab-session-reader read` is the Session-specific consumer: it resolves a readable ref, asks Local Core to refresh/materialize the current raw snapshot, and returns normalized turns plus a snapshot-pinned page cursor. It remains a thin Python transport and must not duplicate provider parsing. `bin/colab-skill-tool` discovers local Skill sources and manages target-specific status/install/ensure/check-update/update/uninstall through Local Core. Do not recreate Shared Item CRUD inside it or add a generic `colab.py` command bag.

The distributable Skill canonical name and installation directory are `agent-colab`; the UI name is **Agent Colab**. `bin/colab-open` is the explicit GUI launcher when a user asks to open the page; `colab-browser open` remains resource discovery only. Setup considers an Agent target installed only when `SKILL.md`, `agents/openai.yaml`, and all five `bin/` entry points are present through the managed target link; a directory or receipt alone is insufficient. An update may remove the legacy `colab` link only when it resolves into this product's managed version store.

`colab-transfer` is the only Quick Share entrypoint. `receive` must be one operation that validates the capability, streams the fixed manifest to Local Core materialization and returns ready-to-use paths; never add a preliminary inspect command. Create accepts local Files, Session and Skill sources without requiring login or membership, and revoke uses the creator receipt unless an explicit revoke capability is supplied. Capability values are secrets: never echo them in diagnostics or log them from Local Core.

Skill consumption is an installation lifecycle: load metadata, choose a target Agent, install, check updates and update, then let that Agent's native loader use the installed Skill. Do not implement it as Browser-driven directory reading merely because its transport may reuse Files snapshots.

The Skill is a Python standard-library thin client for Local API. It never reads credentials, requests Server directly, or exposes cache internals. stdout is stable JSON; diagnostics go to stderr; documented exit codes are part of the contract.

Generated “Give to Agent” instructions must use the actual stable installed executable recorded for the selected Agent target and a canonical `colab://` reference. Package tests must run every executable entry point from a temporary installation tree. In-process imports are insufficient because the installed `bin/` path and source-tree package path differ.

For a known Shared Item, `use --ref` is the single consumption operation: it owns name resolution, access checks, refresh/materialization and local-path delivery. `open` is discovery only. Public refs and normal JSON output use readable names. Resolution is scoped by Local Core's active account and Organization, uses the full descendant path, and exposes UUID refs only inside an explicit ambiguity candidate response.

Files `use` waits for the accepted refresh job and returns both `localPath` and the local directory `tree` in the same response. The generated prompt must not ask the Agent to repeat synchronization or list the tree before deciding what to read.

`setup/colab-setup` installs immutable GUI/Core/Skill versions, activates stable links, writes an ownership receipt, registers the platform service, and opens the Local-Core-hosted GUI. It must verify the release manifest and every artifact before activation. Never make Electron the setup dependency.

On macOS, replacing an already loaded LaunchAgent requires `bootout` followed by `bootstrap`. launchd can retain the removed label briefly and return EIO; setup uses a short bounded retry and accepts success only when bootstrap succeeds or the exact service is visible again. Do not turn this into unbounded polling.

On Windows, mutable installation state lives in `%LOCALAPPDATA%\AgentColab`; active versions and Agent targets use directory junctions so installation does not require Developer Mode. Setup registers the per-user `AgentColabCore` Task Scheduler entry and `colab-open` runs that task before reading discovery and calling `os.startfile`. Every extensionless Python command has a sibling `.cmd` launcher; generated Windows prompts must use it because PowerShell does not honor Unix shebangs. Release selection must match `platform=windows, arch=x86_64`; never install a Darwin Core on Windows.

Release archives are untrusted input even after transport: reject traversal paths and links, extract into per-run staging directories, then atomically activate stable links. During alpha, restart the platform service without blocking setup on watcher shutdown and do not add automatic business-data migration or rollback. Health-gated rollback belongs to release hardening after the product loop works.
