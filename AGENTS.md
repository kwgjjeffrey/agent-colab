# Agent Colab engineering guide

Read `docs/product.md`, `docs/interaction.md`, `docs/technical-design.md`, and `docs/agent-interface.md` before changing product behavior or boundaries. `docs/implementation-plan.md` and `docs/validation-plan.md` are live status documents and must be updated with verified results.

The independently released or deployed units are Electron Shell, Desktop GUI resources, Rust Local Core, Python Colab Skill, and Rust Server. Do not move business logic across these boundaries for convenience. GUI and Skill call Local Core; Local Core calls Server. Server is never bundled into the desktop distribution.

The release channel has its own promotion identifier, while every client artifact has an independent version read from its owning directory. Never advance Electron Shell merely because Core, GUI, or Skill changed. A single user-facing update operation compares all artifact versions and installs only changed artifacts.

Keep provider-specific release credentials and endpoints in ignored configuration. Checked-in release code may define provider adapters and examples, but must remain usable by an open-source fork with a different artifact store, signer, domain, or deployment host.

Cloudflare R2 is the current client-artifact provider. `packaging/publish-to-r2.sh` is the canonical publisher; it uploads immutable version keys, verifies every artifact through the public custom domain, then promotes the signed `channels/stable.json`. The VPS hosts Colab Server only and is not a client-artifact origin.

Public artifact readback uses the checked-in curl verifier with proxies bypassed, retries, timeout, then exact size and SHA-256 comparison. Large immutable artifacts use parallel HTTP Range reads, are reassembled in byte order, and still receive one full size/hash check. Python `urlopen` is not acceptable here: on macOS it can inherit a proxy stack that stalls mid-body despite a healthy R2 response. An unchanged immutable artifact already present in the currently promoted channel may reuse that prior full verification when its version, size and digest all match.

Build only the artifact that changed with `packaging/build-local-artifacts.sh --component <local-core|desktop-ui|colab-skill|electron-shell>`. The no-argument form builds Core, GUI, and Skill; `--with-shell` explicitly adds the infrequently released Electron artifact.

Do not add placeholder UI actions or fake success states. A visible action must call a real use case and expose progress, success, and failure. Prefer established libraries over custom protocol, archive, cryptography, OAuth, component, or email implementations.

Large modules must be split by owned capability. Comments should explain invariants, security boundaries, recovery behavior, and non-obvious protocol decisions; do not narrate straightforward syntax.
