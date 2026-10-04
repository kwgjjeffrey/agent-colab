# Desktop artifacts

Messages use a compact Discord-style row stream, not identity-colored chat bubbles. Keep every
sender left-aligned so text, files and other rich content share one stable column. People and Agents
use the same compact framed avatar; Agents additionally use the owner's avatar with a supernova ring,
an `AI` badge, and ownership in the display name. Reveal timestamps and secondary actions on hover.
The workspace touches the tab divider, side boundary and viewport bottom without a rounded card
shell. The composer has only the workspace separator, no nested input border, and a solid circular
up-arrow submit action.

Files has exactly one visible source-selection action in both Channel Files and Quick Share. Never
reintroduce a file-versus-folder dropdown: the unified picker returns the selected path and Local
Core determines whether it is a file or directory.

Messages is the first Channel tab. Its stream/input and member/Agent sidebar are specified in
docs/interaction.md section 6. Blueprint selection uses a two-column Dialog and the shared Agent
prompt component. GUI calls Local Core only; it must not connect directly to Colab Server.

`desktop/ui` is the required, separately versioned React/Vite resource artifact. `desktop/shell` is an optional, infrequently updated Electron launcher for users who want an ordinary App entry. The launcher may own its window, constrained IPC and deep-link forwarding, but it is not the installation/update authority and must never become a requirement for Files or Agent workflows.

Electron resolves the Local Core GUI origin from the protected discovery file once when opening a window. It must not bundle, activate, roll back, independently select GUI resources, or poll discovery; doing so would create a second GUI/update authority and make browser/App behavior diverge.

Electron preload exposes the boolean `colabHost.isElectron`; this trusted bridge is the only GUI host test. An ordinary browser may show the current platform's Electron artifact download link from the verified release manifest, while Electron itself hides that acquisition prompt. Do not infer Electron from the user-agent string.

The Local Core loopback origin and browser credential are installation-scoped and stable across process restarts. During an explicit managed update, the GUI performs a bounded same-origin readiness probe until the Core PID changes, then reloads. This flow must work unchanged in an ordinary browser; Electron is only an optional launcher.

Neither artifact owns accounts, Channels, file synchronization, SQLite, or remote service calls. Those go through the Local API. Local Core hosts the active GUI resources on loopback HTTP, so the system browser and Electron display exactly the same application.

Member invitation success means the durable invitation and email outbox intent were committed, not
that an external provider completed delivery during the click. The UI reports “queued for
delivery”; it must not claim “sent” or turn a provider retry into a failed invitation.

Feature UI belongs under `ui/src/features/<feature>/`; `main.tsx` may compose features but must not absorb their browsing, preview, synchronization-trigger or prompt-building logic.

“Give to Agent” for a known Shared Item emits one directly executable `colab-browser use --ref ...` instruction. It must not expose preliminary `open` checks, cache paths, database UUIDs, or multi-step synchronization plumbing. References use the readable Channel and Shared Item path defined by `docs/agent-interface.md`; Browser handles rare ambiguity explicitly.

Session UI lives in `ui/src/features/sessions`. It lists local Agent sources through Local Core, never scans provider directories in React. The GUI does not preview Session contents or call the Reader when an item is clicked; it shows metadata and the latest committed synchronization time, then hands explicit consumption to `colab-session-reader read` through Give-to-Agent. Unlike Files, no cache path is exposed because provider adapters normalize raw records behind the Reader contract.

Files drill-down UI lives in `ui/src/features/files/FileExplorer.tsx`; format rendering belongs in `FilePreview.tsx`, not the collection list. Keep the IDE-style tree/content workspace independent of synchronization. Browser-native image/PDF previews use the authenticated Local Core raw stream; DOCX/XLSX renderers load only after selection and must retain the client-side size guard. Unsupported, corrupt, or oversized formats report inside the preview pane and must not become a page-level synchronization error.

The Share Session dialog opens before data loading and searches the Local Core metadata catalog after a short input debounce. Results show the coding Agent and session/thread ID so similarly named sessions remain distinguishable.

Files rows optimize for human attribution, not Git internals: show contributor avatar/name and `(me)` for the current contributor, never expose root OIDs as versions, keep secondary actions hidden until hover/focus, and render Withdraw as destructive. File and folder registration share one visible entry point; the UI must never re-expose the source kind as a second choice.

Files scope preview is a low-frequency Local Core operation. React must request it on demand and must not invent a local index or cached exclusion state. Local Core reads and writes the contributor shadow Git `info/exclude` directly.

The action opens a dismissible prompt Dialog. Its primary split-button copies the target-specific installed command and opens the user's default Agent; other installed Agents live in the adjacent dropdown. Opening an Agent is a Local Core platform operation. Do not claim automatic prompt insertion unless that Agent exposes and we implement a supported API.

Settings must report the actual installed version, channel, location, update status, and last failure for Shell, GUI, Local Core, and every supported Skill target. Never infer “installed” from a button click; read installation receipts and the filesystem.

An update check must visibly progress to updates available, up to date, or failure inside Settings; a successful no-op must not look like a dead button. The running bundle compares its embedded package version with the active `ui.json` when the window regains focus and reloads after Local Core switches the GUI root. Do not add a permanent update/discovery polling timer.

Initial Channel loading has three distinct states: loading, successfully empty, and failed. A failed
request must render a retry surface and retain any prior data; it must never masquerade as “Create
your first Channel.” User-visible subprocess failures are bounded summaries, never raw tracebacks.

All context types use `features/agent/AgentPromptDialog` for Give to Agent. A feature owns only its prompt body; dialog sizing, overflow handling, target availability, default-Agent primary action, clipboard and Agent launch behavior must not be duplicated.

Quick Share lives under `ui/src/features/transfers` and is a global entry independent from authentication and the selected Channel. Its entry is a type dropdown plus `Manage shared items`; one selection creates exactly one fixed-snapshot Transfer immediately. React gathers local Files, Session-catalog and Skill-catalog sources, but Local Core owns snapshot creation, streaming upload, capability receipts, expiry changes and revoke. Closing the result Dialog does not cancel the share. Keep every source row and prompt bounded inside the Dialog. The result surface copies one self-contained receiver prompt; when the selected Agent target is not installed, that prompt uses the signed public installer before calling `colab-transfer receive`. Never expose upload/revoke capabilities in the prompt or imply that the fixed transfer tracks later source changes.

Quick Share uses the standard shadcn Dialog composition. `DialogHeader` and `DialogFooter` are direct
children of `DialogContent`; only the body scrolls. Do not place `DialogFooter` inside `ScrollArea` or
another padded wrapper because the primitive's negative margins are defined against DialogContent.

Messages mentions use the Tiptap atomic Mention node. Never replace this with a decorated textarea
or recover Agent identity by parsing `@display name`; the node's blueprint UUID is authoritative.
Preserve every visible `@Agent` label in the complete message body and submit that body together
with the rich document. Server derives routing identities from the atomic nodes. Never render
request lifecycle rows in the timeline. The Agent member item derives “Agent is working” from
durable request state only after the target runtime ACKs command delivery; reconcile it on request
invalidation, heartbeat, socket open, focus, and visibility restoration.

Show the Agent Colab Skill as one independently versioned artifact. Codex, Claude Code, and MyFlicker rows are installation targets for that same artifact, not separately versioned copies. Settings offers one check/update action; per-artifact rows explain what will change instead of exposing redundant update buttons.

The implemented Settings popover calls Local Core's allow-listed system API. Local Core delegates every check/install/update/uninstall mutation to the packaged Python setup; React must not write Skill directories or activate artifacts itself. Agent targets are independent (`codex`, `claude`, `myflicker`) and their state comes from managed links on disk.

Settings persists one device-local default Agent in Local Core SQLite. Only an installed Agent can be selected from the GUI.

The launcher is separately downloadable per platform: macOS publishes a human-facing DMG plus a ZIP/App machine-consumed artifact, and Windows uses a self-bootstrapping x64 executable during alpha. The Windows executable carries verified seed copies of Core, GUI, and Skill so a first-time user can double-click one artifact; those components remain independently versioned and use the normal setup/update path afterward. Alpha packages may be unsigned only when labeled as development acceptance builds; do not call them production installers or imply notarization/code signing.

Keep components and use-case clients out of a monolithic entry file. Shared UI primitives live under `ui/src/components`; feature code lives under `ui/src/features/<feature>`; Local API access lives under `ui/src/api`.

Messages currently uses the Channel as its first Conversation scope. Do not imply that execution
state is conversation content: `@Agent` commits one ordinary rich message, while Server may derive
separate runtime commands and Agents report only through ordinary messages. A future cross-Channel
DM surface remains an application-level information architecture decision, not a reason to move
runtime protocol details into the timeline. See `docs/interaction.md` section 6 before extending it.

The account realtime WebSocket is a singleton shared by Messages and Canvas; never open a feature-local
socket. It is only a wake-up path. Server text heartbeats keep it observable through the
Local Core bridge; the GUI records every received frame and closes an otherwise-open socket after 45
seconds of silence. Treat every heartbeat, matching invalidation, socket open, window focus, and
document visibility restoration as a reconciliation barrier: run one single-flight
`after=lastSeq` fetch even when the socket still looks healthy. An invalidation can be lost during
an account switch, proxy reconnect, or sleep while later heartbeats keep the same socket alive, so
realtime liveness must never be used as proof that the durable cursor is current.

Canvas uses Tiptap Collaboration on a Y.Doc, but it must fetch and apply the initial ordered update set
before mounting the editor. Otherwise an empty ProseMirror document can emit a local update before the
remote state is loaded. GUI updates go to Local Core over HTTP; `canvas.invalidated` only triggers
ordered repair. `Loading`, `Saving locally`, `Saved locally · Offline`, and `Synced` are distinct states.
Do not expose Yjs/Yrs structures in GUI-to-Agent contracts or add Canvas logic to Electron Shell.
Canvas document/folder creation uses the New menu and immediately inserts an inline-editable tree item through real Local Core routes; double-click renames and every folder
offers an in-place child-document action. Canvas handoff must reuse `AgentPromptDialog` and include exact
list/read/edit commands. Member and Agent mentions are structured inline nodes; hover/focus opens an identity card, and only an Agent card exposes its Server-backed send action. Agent task
context is the user-visible enclosing Heading section rather than an internal editor block.

The application shell owns the viewport and must not grow with the message history. Keep the
Channel rail and composer pinned inside the viewport; only the timeline and participant list may
scroll. Cache each Channel's loaded rows and cursor while the GUI is alive, fetch only the cursor
delta when returning, and restore that Channel's timeline scroll offset. Channel identity and Quick
Share share one compact header row rather than separate vertical bands.

The participant list is a compact flat roster, not a disclosure tree. Render each member and their
selected Agents without item borders; an Agent reuses the owner's small avatar plus the same
supernova ring used in the timeline. Only the current member exposes the Agent-count management
entry. Other members' Agents are immediately visible and read-only.

Global Settings starts with only the active User and Organization plus Switch drill-down actions,
then My Agents with its count, Skill installation targets, and a collapsed Updates section at the
bottom. Do not expand every saved account, Organization, or artifact version on the first surface.

Do not reserve a permanent GUI strip for global Loading or Agent activity. If native titlebar status
is not implemented by Electron, leave the native titlebar alone and show progress only inside the
feature surface that owns the operation.
