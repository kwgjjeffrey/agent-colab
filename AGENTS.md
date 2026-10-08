# Agent Colab engineering guide

The Channel workspace uses a mixed Catalog tree, not type tabs. Preserve the
persistent Channel header (identity editing, members, Quick Share), fixed Add and
Message entries, and stable asset IDs. Add retains Home use cases/activity plus
creation entrances. Catalog placement is Server-owned and must reject cross-Channel
parents, cycles and destructive non-empty deletion. Existing Canvas folders retain
their IDs/storage names for compatibility; never implement a second folder model.
`colab-explorer` is the new mixed-tree Agent interface. `colab-browser` remains
legacy with unchanged flat-reference semantics; do not reinterpret old handoffs.
Readable location refs and stable identity/consumer refs are distinct. Moving or
renaming an item must not change its identity or break UUID-based consumption.
See `docs/catalog-implementation-plan.md` for scope and acceptance status.

Read `docs/product.md`, `docs/interaction.md`, `docs/technical-design.md`, and `docs/agent-interface.md` before changing product behavior or boundaries. `docs/implementation-plan.md` and `docs/validation-plan.md` are live status documents and must be updated with verified results.

Read `docs/canvas-technical-design.md` before changing Canvas. Canvas durable mutations use HTTP through Local Core; Canvas and Conversation invalidations share the one account realtime WebSocket. Local Core owns the Yrs replica, projection codec, durable outbox, retry, and ordered repair. Agent tools receive a Markdown/TXT projection and must never expose CRDT internals. The current Canvas implementation and validation scope is macOS first.

The independently released or deployed units are Electron Shell, Desktop GUI resources, Rust Local Core, Python Colab Skill, and Rust Server. Do not move business logic across these boundaries for convenience. GUI and Skill call Local Core; Local Core calls Server. Server is never bundled into the desktop distribution.

The release channel has its own promotion identifier, while every client artifact has an independent version read from its owning directory. Never advance Electron Shell merely because Core, GUI, or Skill changed. A single user-facing update operation compares all artifact versions and installs only changed artifacts.

Keep provider-specific release credentials and endpoints in ignored configuration. Checked-in release code may define provider adapters and examples, but must remain usable by an open-source fork with a different artifact store, signer, domain, or deployment host.

Cloudflare R2 is the current client-artifact provider. `packaging/publish-to-r2.sh` is the canonical publisher; it uploads immutable version keys, verifies every artifact through the public custom domain, then promotes the signed `channels/stable.json`. The VPS hosts Colab Server only and is not a client-artifact origin.

Public artifact readback uses the checked-in curl verifier with proxies bypassed, retries, timeout, then exact size and SHA-256 comparison. Large immutable artifacts use parallel HTTP Range reads, are reassembled in byte order, and still receive one full size/hash check. Python `urlopen` is not acceptable here: on macOS it can inherit a proxy stack that stalls mid-body despite a healthy R2 response. An unchanged immutable artifact already present in the currently promoted channel may reuse that prior full verification when its version, size and digest all match.

Build only the artifact that changed with `packaging/build-local-artifacts.sh --component <local-core|desktop-ui|colab-skill|electron-shell>`. The no-argument form builds Core, GUI, and Skill; `--with-shell` explicitly adds the infrequently released Electron artifact.

Do not add placeholder UI actions or fake success states. A visible action must call a real use case and expose progress, success, and failure. Prefer established libraries over custom protocol, archive, cryptography, OAuth, component, or email implementations.

Large modules must be split by owned capability. Comments should explain invariants, security boundaries, recovery behavior, and non-obvious protocol decisions; do not narrate straightforward syntax.

For end-to-end validation, start at regression_test/README.md (concrete commands, scope selection and fixture reuse), then regression_test/AGENTS.md. Choose cases for the changed capability; installation/login belong to release acceptance.

Engineering tracing uses the separate Trace skill, not the Agent Colab Skill. This repository owns operation registries and project adapters; generic tooling stays in the separately installed skill. Follow the managed dependency instructions below.

<!-- trace-skill:start -->
## Agent Dev Suite dependency

This project uses the separately installed Agent Dev Suite for instrumentation, trace analysis and regression tests. It is not vendored or Git-tracked here.

If unavailable, install the whole skill:

```sh
curl -fsSL https://raw.githubusercontent.com/kwgjjeffrey/trace/main/setup/install.sh | sh
```

The installer verifies the release and prepares private runtime dependencies. Default installation: ~/.codex/skills/trace; set TRACE_INSTALL_DIR for another agent host. Read the installed SKILL.md, then load only instrumentation/, analysis/ or regression_test/ instructions needed for the task. Use setup/run.sh when Node is not on PATH.

Project registries, adapters and cases stay in this repository; tokens and personal destinations stay in ignored or external private configuration. No configured destination means tracing stays disabled. Before regression work, read the project regression instructions at regression_test/AGENTS.md and README.md if present. Start with filtered cases and plan for the changed capability; do not dump the full catalog or run every case for a small change. Discover the project's actual registry paths; do not assume the skill installation owns project data.
<!-- trace-skill:end -->
