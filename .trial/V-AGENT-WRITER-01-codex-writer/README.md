# V-AGENT-WRITER-01 — Codex writer and queue semantics

## Question

Can one Local Core keep a single Codex app-server as the writer for every Colab-managed thread,
while Codex Desktop remains able to discover/read those threads and later Channel commands remain
independent tasks rather than steering the active turn?

## Probe

Run [`codex-appserver-write-probe.py`](codex-appserver-write-probe.py) in an environment with the
Codex CLI. The probe speaks the public app-server JSONL protocol directly. It creates two threads
under one app-server and compares:

- a second `turn/start` during an active turn;
- `turn/steer` during an active turn;
- `thread/queue/add` while busy and while idle;
- `thread/queue/list` and explicit `thread/queue/start`;
- commands in two different threads owned by the same app-server.

The earlier writer-ownership check additionally used two app-server processes against one thread:
the owner could resume it, the second process received `already has an active writer`, and the
second process could resume the same thread only after the owner unsubscribed. A non-owner cannot
force-unsubscribe it. Codex Desktop could still list and read the externally owned thread.

## Observations (2026-10-01)

1. A second `turn/start` returned the existing active turn ID. It is steer-like, not an independent
   queued task. Explicit `turn/steer` behaved the same way.
2. `thread/queue/add` returned its own queued submission. While the thread was busy it remained in
   `thread/queue/list`.
3. When the thread became idle, the owning app-server consumed the queued submission automatically
   and started a new turn. Calling `thread/queue/start` while a turn was active/pending was rejected.
4. One app-server can own several threads. Serialization is per thread; separate threads are not a
   reason to create separate provider processes.
5. The standalone probe's model execution is not product-success evidence: the PATH CLI advertised
   internal model aliases that its ChatGPT endpoint rejected. The verified evidence here is the
   provider's scheduling and writer state transitions. Product execution must still use the bundled
   Codex binary selected by Local Core and be checked end to end after installation.

## Decision and implementation mapping

- `AppState` owns one long-lived `CodexManager` and therefore one app-server process.
- `(channel_id, blueprint_id)` remains the durable logical binding to a provider thread.
- Every Server request enters `thread/queue/add` with the stable request ID as
  `clientUserMessageId`.
- Local Core correlates FIFO `turn/started`/`turn/completed` events to accepted requests; it does
  not copy the provider queue into SQLite.
- Only `completed` is success. Interrupted, failed, cancelled or timed-out turns fail the durable
  Agent request.
- Binding adapter version 3 identifies threads owned by the persistent manager. Older per-request
  bindings are deliberately not resumed.
- A clearly missing provider thread may be replaced. Busy/active-writer errors must never rotate
  the binding.

## Installed macOS black-box result

- Core `0.1.62-dev` executed four real requests through the installed Local Core and Skill in the
  same Desktop-visible thread `01a0f6e9-d8d0-7802-8cd8-08a2e15451db`.
- The first two requests returned Channel seq 40 and 42 in order. After forcibly restarting the
  launchd-managed Local Core, the replacement manager resumed the persisted binding and returned
  seq 44 and 46 from the same thread. All four durable Server requests reached `succeeded`.
- The remaining non-blocking stress check is progress across two different blueprint threads.
- Fault injection for a provider/Core failure during an already queued request remains useful to
  verify explicit durable failure or retry rather than false completion.

### Desktop-owned restart race (Core 0.1.63-dev)

After Desktop acquired the persisted thread writer, request `eb7f0fee…` proved the old Core failed
at `thread/resume` before queue submission. The repaired Core treats that exact active-writer error
as ownership state, retains thread `01a0f6e9-d8d0-7802-8cd8-08a2e15451db`, and calls
`thread/queue/add` without mutating thread settings. Installed request `c47b335d…` was accepted by
that original provider queue, appeared as an in-progress turn in Codex Desktop, and reached durable
`succeeded`. Its request-scoped tool call produced Channel seq 55; Server added the structured
requester mention and reply link to trigger seq 54. The validation prompt intentionally asked the
Agent to wait, so Codex briefly exposed its normal shell-approval state before completing; the
Channel's working projection remained derived from durable request state throughout.
