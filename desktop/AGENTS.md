# Desktop artifacts

`desktop/ui` is the required, separately versioned React/Vite resource artifact. `desktop/shell` is an optional, infrequently updated Electron launcher for users who want an ordinary App entry. The launcher may own its window, constrained IPC and deep-link forwarding, but it is not the installation/update authority and must never become a requirement for Files or Agent workflows.

Electron resolves the Local Core GUI origin from the protected discovery file once when opening a window. It must not bundle, activate, roll back, independently select GUI resources, or poll discovery; doing so would create a second GUI/update authority and make browser/App behavior diverge.

Electron preload exposes the boolean `colabHost.isElectron`; this trusted bridge is the only GUI host test. An ordinary browser may show the current platform's Electron artifact download link from the verified release manifest, while Electron itself hides that acquisition prompt. Do not infer Electron from the user-agent string.

The Local Core loopback origin and browser credential are installation-scoped and stable across process restarts. During an explicit managed update, the GUI performs a bounded same-origin readiness probe until the Core PID changes, then reloads. This flow must work unchanged in an ordinary browser; Electron is only an optional launcher.

Neither artifact owns accounts, Channels, file synchronization, SQLite, or remote service calls. Those go through the Local API. Local Core hosts the active GUI resources on loopback HTTP, so the system browser and Electron display exactly the same application.

Feature UI belongs under `ui/src/features/<feature>/`; `main.tsx` may compose features but must not absorb their browsing, preview, synchronization-trigger or prompt-building logic.

“Give to Agent” for a known Shared Item emits one directly executable `colab-browser use --ref ...` instruction. It must not expose preliminary `open` checks, cache paths, database UUIDs, or multi-step synchronization plumbing. References use the readable Channel and Shared Item path defined by `docs/agent-interface.md`; Browser handles rare ambiguity explicitly.

Session UI lives in `ui/src/features/sessions`. It lists local Agent sources through Local Core, never scans provider directories in React. Reading and Give-to-Agent use `colab-session-reader read`; unlike Files, no cache path is exposed because provider adapters normalize raw records behind the Reader contract.

The Share Session dialog opens before data loading and searches the Local Core metadata catalog after a short input debounce. Results show the coding Agent and session/thread ID so similarly named sessions remain distinguishable.

Files rows optimize for human attribution, not Git internals: show contributor avatar/name and `(me)` for the current contributor, never expose root OIDs as versions, keep secondary actions hidden until hover/focus, and render Withdraw as destructive. File and folder registration share one visible entry point even if the platform picker needs a second choice internally.

Files scope preview is a low-frequency Local Core operation. React must request it on demand and must not invent a local index or cached exclusion state. Local Core reads and writes the contributor shadow Git `info/exclude` directly.

The action opens a dismissible prompt Dialog. Its primary split-button copies the target-specific installed command and opens the user's default Agent; other installed Agents live in the adjacent dropdown. Opening an Agent is a Local Core platform operation. Do not claim automatic prompt insertion unless that Agent exposes and we implement a supported API.

Settings must report the actual installed version, channel, location, update status, and last failure for Shell, GUI, Local Core, and every supported Skill target. Never infer “installed” from a button click; read installation receipts and the filesystem.

An update check must visibly progress to updates available, up to date, or failure inside Settings; a successful no-op must not look like a dead button. The running bundle compares its embedded package version with the active `ui.json` when the window regains focus and reloads after Local Core switches the GUI root. Do not add a permanent update/discovery polling timer.

All context types use `features/agent/AgentPromptDialog` for Give to Agent. A feature owns only its prompt body; dialog sizing, overflow handling, target availability, default-Agent primary action, clipboard and Agent launch behavior must not be duplicated.

Show the Agent Colab Skill as one independently versioned artifact. Codex, Claude Code, and MyFlicker rows are installation targets for that same artifact, not separately versioned copies. Settings offers one check/update action; per-artifact rows explain what will change instead of exposing redundant update buttons.

The implemented Settings popover calls Local Core's allow-listed system API. Local Core delegates every check/install/update/uninstall mutation to the packaged Python setup; React must not write Skill directories or activate artifacts itself. Agent targets are independent (`codex`, `claude`, `myflicker`) and their state comes from managed links on disk.

Settings persists one device-local default Agent in Local Core SQLite. Only an installed Agent can be selected from the GUI.

The optional launcher is separately downloadable per platform: macOS uses a ZIP/App artifact and Windows uses a portable x64 executable during alpha. Alpha packages may be unsigned only when labeled as development acceptance builds; do not call them production installers or imply notarization/code signing.

Keep components and use-case clients out of a monolithic entry file. Shared UI primitives live under `ui/src/components`; feature code lives under `ui/src/features/<feature>`; Local API access lives under `ui/src/api`.
