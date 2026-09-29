# Agent Colab

Agent Colab is a context-sharing layer for collaboration between people and their coding agents. A Channel collects shared Files, Sessions, and Skills so another person or agent can continue the work without a human acting as a lossy messenger.

> **Alpha:** the project is usable for evaluation, but the public service and unsigned desktop builds are not yet production-ready.

## What works

- Google sign-in, Organizations, Channels, and member management
- File and folder sharing with background synchronization and local materialization
- Codex, Claude Code, and MyFlicker session discovery, sharing, incremental synchronization, and paginated reading
- Agent Skill discovery, sharing, installation, update, and removal
- A Python Agent Colab Skill that exposes the same workflows as the GUI
- Independently updated Desktop UI, Rust Local Core, Agent Skill, and optional Electron shell

## Try the published alpha

> **This is the evaluation path, not a development prerequisite.** The downloads below let you experience the already-built Agent Colab product against its hosted alpha service. Contributors and self-hosters can skip this section and go directly to [Development](#development).

The Electron shell is a convenient desktop entry point. On Windows it also bootstraps the first local installation; afterward Local Core, browser UI, Agent Skill, and Electron remain independently versioned and updated. The Local Core and browser UI still work without Electron, and the Agent Colab Skill can start them directly.

Download the public alpha artifacts here:

| Path | Download |
| --- | --- |
| Windows desktop (one-file first-run bootstrap) | [`Colab-0.1.18-dev-x64.exe`](https://github.com/kwgjjeffrey/agent-colab/releases/download/v0.1.58-dev/Colab-0.1.18-dev-x64.exe) |
| macOS desktop launcher (Apple silicon DMG) | [`Colab-0.1.18-dev-arm64.dmg`](https://github.com/kwgjjeffrey/agent-colab/releases/download/v0.1.58-dev/Colab-0.1.18-dev-arm64.dmg) |
| macOS installer | [`colab-install`](https://github.com/kwgjjeffrey/agent-colab/releases/download/v0.1.58-dev/colab-install) |
| Windows headless / Skill-first installer | [`colab-install.ps1`](https://github.com/kwgjjeffrey/agent-colab/releases/download/v0.1.58-dev/colab-install.ps1) |
| All platform and component artifacts | [GitHub Releases](https://github.com/kwgjjeffrey/agent-colab/releases) |

The versioned links above identify the currently documented alpha. Use the Releases page to inspect newer prereleases and their checksums.

### macOS

Download and open the DMG for the ordinary App launcher. The launcher expects Local Core, GUI resources, and the Agent Colab Skill to be installed; install those once with `colab-install`:

```bash
chmod +x ./colab-install
./colab-install --with-app
```

macOS builds are currently ad-hoc signed and not notarized. The installer applies the required local Gatekeeper exception only to the downloaded Colab application.

### Windows

For the desktop path, download and run `Colab-*-x64.exe`. On first launch it installs the bundled Local Core, browser UI, and Agent Colab Skill for the current Windows account, registers Local Core to start at sign-in, and then opens Colab. Sign-in configuration is part of the official build; end users do not provide OAuth configuration files. The Windows executable is currently unsigned, so Windows may show a SmartScreen warning during this alpha phase.

For a headless or Skill-first installation, download `colab-install.ps1`, then run PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\colab-install.ps1
```

If desktop setup cannot install or start Local Core, it shows a native error and writes diagnostics to `%LOCALAPPDATA%\AgentColab\logs\electron-shell.log`.

After installation, ask a supported coding agent to “open Agent Colab,” or run the installed `colab-open` command from the Agent Colab Skill.

## Architecture

### Runtime and deployment boundaries

The browser UI and the Python Skill are two clients of the same Local Core. Electron is an optional launcher, not an application server and not a prerequisite for either path. Business logic does not move between these independently released units for packaging convenience.

[![Runtime and deployment boundaries](docs/architecture/runtime-boundaries.svg)](docs/architecture/runtime-boundaries.mmd)

The call direction is an invariant: **GUI and Skill call Local Core; Local Core calls Server**. Server is never bundled with the desktop application. Local Core owns device paths, provider adapters, background synchronization, and local credentials; Server owns shared identity, authorization, metadata, and remote blobs.

### Persistent data model

The server stores relationships and publication metadata in PostgreSQL. Shared contents remain opaque blobs: Files and Skills use immutable Git pack revisions, while Sessions preserve source records in immutable segments. The local database is a cache and work queue, not a second remote source of truth.

[![Persistent data model](docs/architecture/persistent-data-model.svg)](docs/architecture/persistent-data-model.mmd)

`CHANNEL_SHARE` is the common metadata envelope (`files`, `session`, or `skill`), not a common content schema. Provider-specific Session records are deliberately not rewritten on upload; reader adapters normalize them only when an agent reads a Session.

### Files and Skills synchronization

Git is used locally as a content-addressed change detector and pack generator. It is **not** pushed to a remote Git repository and does not touch the source repository's `.git` directory. The server receives immutable packs through its blob plane and advances the shared item's current root only after the corresponding metadata operation succeeds.

[![Files and Skills synchronization](docs/architecture/files-skills-sync.svg)](docs/architecture/files-skills-sync.mmd)

Files are consumed through native filesystem tools after materialization. Skills add an explicit install/update step that copies the verified materialization into the selected coding agent's Skill location.

### Session synchronization and reading

Sessions keep their provider's original records. A source adapter finds complete new records after the last source cursor; uploads are bounded immutable segments, so long conversations do not require a full re-upload. On read, the consumer caches missing segments locally and the appropriate provider adapter returns a normalized, paginated view.

[![Session synchronization and reading](docs/architecture/session-sync.svg)](docs/architecture/session-sync.mmd)

### Repository and release units

The independently released units are:

- `desktop/` — browser UI resources and the optional Electron shell
- `local/` — the Rust Local Core, which owns local state and background work
- `skills/agent-colab/` — the Python Agent Colab Skill and deterministic command wrappers
- `server/` — the independently deployed Rust/PostgreSQL coordination server
- `docs/` — product, interaction, technical, and agent-interface design
- `.trial/` — reproducible technical validation work
- `packaging/` — artifact build, verification, publication, and installation tools

The GUI and Agent Skill call Local Core; Local Core calls Server. Cloudflare R2 is the current client-artifact origin, while GitHub Releases mirror public builds for evaluation. Server is deployed separately and is never bundled into a desktop artifact.

## Development

Development and self-hosting start from the source tree; none of the prebuilt evaluation downloads above are required. The hosted alpha service is only one deployment of the same Server boundary.

Prerequisites: Rust, Python 3, Node.js, pnpm, Git, and PostgreSQL.

```bash
pnpm --dir desktop install
pnpm --dir desktop check
cargo test --manifest-path local/Cargo.toml
cargo test --manifest-path server/Cargo.toml
python3 -m unittest discover -s skills/agent-colab/tests
```

Read `AGENTS.md` and the design documents before changing behavior or module boundaries. Provider credentials and deployment endpoints belong in ignored local configuration; never commit them.

## Release model

Each client artifact has its own version. A release-channel identifier promotes a compatible set but does not force unchanged components—especially the Electron shell—to receive a new version. The canonical R2 publisher verifies immutable objects by public readback before promoting `channels/stable.json`.

GitHub Releases provide a public mirror of the same verified alpha artifacts. They are not a second update channel or source of truth.

## License

Licensed under the [Apache License 2.0](LICENSE). It permits commercial use, modification, distribution, and private forks, while preserving notices and providing an explicit contributor patent grant. Modified files distributed by a downstream project must be identified as changed. The license does not grant rights to project trademarks and provides the software without warranty.
