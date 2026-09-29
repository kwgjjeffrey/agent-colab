# E2E-AGENT-TOOLS-01

Validates the installed Agent scaffolding against the real Local Core, Server, and two saved
Google accounts. The contributor shares temporary Files, Session, and Skill items through
`colab-browser`; the other account must list and consume them through `colab-browser`,
`colab-session-reader`, and `colab-skill-tool`. The contributor then withdraws all fixtures.

Run:

```bash
python3 .trial/E2E-AGENT-TOOLS-01/live_cross_account.py
```

Optional environment variables: `COLAB_E2E_OWNER`, `COLAB_E2E_CONSUMER`,
`COLAB_E2E_CHANNEL`, `COLAB_SKILL_ROOT`, and `COLAB_DISCOVERY_FILE`.

The test never reads or prints remote credentials. It requires both real accounts to already
be saved in Local Core and to share access to the configured Channel.

## Verified result

2026-09-29, release `0.1.52-dev` / Local Core `0.1.36-dev` / Skill `0.1.34-dev`:

- owner shared one temporary Files item, one indexed Session, and one Skill;
- consumer listed all three, materialized byte-identical Files, read Session turns plus a fixed
  snapshot, and installed/uninstalled the Skill for MyFlicker;
- owner withdrew all three fixtures during cleanup.
