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

## Install

The optional Electron shell is only a convenient launcher. The Local Core and browser UI work without Electron, and the Agent Colab Skill can start them directly.

Download the latest alpha assets from [GitHub Releases](../../releases).

### macOS

Download `colab-install`, then run:

```bash
chmod +x ./colab-install
./colab-install --google-credentials /path/to/client_secret.json --with-app
```

macOS builds are currently ad-hoc signed and not notarized. The installer applies the required local Gatekeeper exception only to the downloaded Colab application.

### Windows

Download `colab-install.ps1`, then run PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\colab-install.ps1 -GoogleCredentials C:\path\to\client_secret.json
```

The bootstrap installs Local Core, the browser UI, and Agent Colab Skill. Download the optional `Colab-*-x64.exe` launcher from the same release. The Windows executable is currently unsigned, so Windows may show a SmartScreen warning during this alpha phase.

After installation, ask a supported coding agent to “open Agent Colab,” or run the installed `colab-open` command from the Agent Colab Skill.

## Architecture

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

Licensed under the MIT License. See [LICENSE](LICENSE).
