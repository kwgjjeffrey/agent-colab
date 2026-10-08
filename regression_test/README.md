# Run Colab end-to-end regression

The runner is the separately installed Trace skill (`~/.codex/skills/trace/SKILL.md`). This repository owns cases, environment bindings and evidence; it does not vendor the runner. Read [AGENTS.md](AGENTS.md) and [environment/README.md](environment/README.md) before choosing cases. Run from the repository root.

```sh
sh ~/.codex/skills/trace/setup/run.sh regression_test/cli.mjs doctor
sh ~/.codex/skills/trace/setup/run.sh regression_test/cli.mjs cases
sh ~/.codex/skills/trace/setup/run.sh regression_test/cli.mjs plan --environment local --ids channels.onboarding.workspace --name workspace-acceptance
sh ~/.codex/skills/trace/setup/run.sh regression_test/cli.mjs run --environment local --ids channels.onboarding.workspace --name workspace-acceptance
```

`plan` and `run` must use the same filters. Inspect `selected`, diagnostics and each selected case's prerequisites. The plan includes excluded cases too; its size is not the execution scope. The `local` profile is ignored `environment/environment.local.yaml`. Bind real disposable resources there; `disposable: true` is a declaration, not automatic isolation. The browser needs the dedicated profile configured in `regression.config.yaml`, system Chrome and a reachable authenticated GUI. Our loopback `/embed` proxy resolves private Core discovery internally; no bearer belongs in a command or binding file.

Verify the running Core executable and the GUI's `/ui.json` before starting. An installer receipt alone does not prove the active process. The public release and a local development installation can differ; a normal updater follows the public manifest, including older component versions. Prepare the complete intended release combination first. Desktop GUI and Electron Shell are independent artifacts.

`run` waits and returns a JSON record containing `id`, case `status`, assertions, steps and evidence. A nonzero exit means at least one non-green result. For that returned ID:

```sh
sh ~/.codex/skills/trace/setup/run.sh regression_test/cli.mjs record --id RUN_ID --problems
sh ~/.codex/skills/trace/setup/run.sh regression_test/cli.mjs run_record --id RUN_ID --problems
```

Preserve failure evidence, fix the actual cause, then preview and execute a scoped repair with `--runId RUN_ID` and explicit case IDs. This appends a Round; it never replaces the original. Review each trial case's actions, expected/actual observations, screenshots and cleanup before promoting it with `status`. Active means the script is qualified, not that every later execution passes. Interrupt a running standalone CLI normally so its worker releases the browser profile.

For this release, `channels.onboarding.*` covers focus/navigation/image identity, default Canvas edit/delete, and Messages/Sessions guide behavior. It creates named test Channels, owned messages and synthetic Session shares; it archives its Canvas and withdraws its Session, while retaining named Channels/messages as evidence. Browser focus events prove GUI behavior. Native macOS window lifecycle is separate acceptance through the installed `/Applications/Colab.app`; choosing the app by display name can resolve an older duplicate installation.

## First-use findings from 2026-10-08

The installed skill's setup/init/plan/run/record path worked. The main discovery gap was the lack of one repository quickstart linking that entry point, local resource bindings and execution records; this README supplies it. Existing documentation was spread across AGENTS, environment instructions and the installed skill. `plan` and terminal records return the whole catalog, including excluded cases, so summarize `selected` / `counts` before interpreting their size. No runner code had to be changed for this release.

Most new-case failures came from our own first implementation: a focus response arrives before the single-flight operation finishes, rich text `fill` does not preserve line breaks as assumed, sending remains busy until composer completion, messages trim trailing whitespace, a copied PNG had a bad CRC, and pointer clicks require revealing row-hover controls. These were script repairs, not missing product features. The actual Agent onboarding readiness defect received its own GUI fix. Every intermediate execution remains under the same Run rather than being overwritten.

Release documentation has a separate issue: the installed artifact-release skill's Colab subsection still points at the old Omni/KCDN workflow. This repository's AGENTS.md and canonical R2 publisher are the source of truth for Colab. The skill was not modified here.
