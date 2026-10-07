# Project regression script support

Keep this directory project-owned. The generic Trace skill must not import it or assume Colab endpoints.

client.mjs calls the packaged Python tools or the real Local Core. core.py reuses private discovery authentication; an optional secondCoreDiscoveryFile selects another already authenticated client without exporting its bearer. Cases must obtain all selected resources and parameters from ctx, never read a second environment file.

agent.mjs submits real requests and requires the registered runtime to reach succeeded and write a request-bound result. Codex work events expose the provider thread identifier; prompt.py reads only that test thread's actual user input. Suppress persisted command output for assembled prompts; do not dump unrelated sessions or credential-bearing content.

A disposable flag is an operator assertion about the configured fixtures, not proof of isolation. Create new objects with run-specific names. Existing-object destructive cases require explicitly bound disposable resources and, where relevant, a second client. No daily account logout, runtime interruption, installer activation or membership changes are implicit in using the production server.

Do not add empty runners to make the catalog say implemented. A script export alone does not establish complete variation coverage or successful validation. Keep pending implementation and actual non-green results in the status documents.
