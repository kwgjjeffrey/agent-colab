# V-MESSAGES-RECOVERY-01: half-open Conversation WebSocket

## Hypothesis

A committed Channel message must become visible even when the browser's existing WebSocket is
half-open and never emits `close`. Conversation realtime is only a wake-up path; reconnect must
repair the exact PostgreSQL sequence gap.

## Failure reproduced

The user's real message `3272e22e-31ce-40b1-9ec7-00f5893fd17c` (seq 47) created Agent Request
`0e93006f-6d5e-4899-969a-89d81e5b0663`. Local Core ran it in Desktop-visible Codex thread
`01a0f715-a4ee-7380-8528-80afd293b5a7` for 191 seconds. The Agent shared `sine.png` and committed
reply seq 48 at 18:52:57 Asia/Shanghai, but the open Electron page did not receive an invalidation
or a close event and therefore never ran its cursor catch-up.

## Change under test

- Server sends a text heartbeat every 15 seconds and reads peer close/control frames.
- GUI records every inbound frame and closes a nominally-open socket after 45 seconds of silence.
- Every socket open/reopen fetches messages after the Channel's last applied sequence.

The heartbeat contains no cursor or business state. PostgreSQL message `seq` remains authoritative.

## Acceptance criteria

1. Two consecutive heartbeat frames traverse Server → Local Core bridge → client at the expected cadence.
2. Restarting Server while the bridged socket is open causes the client to reconnect.
3. After reconnect, `after=47` returns exactly the already committed seq 48 without creating another message.
4. The installed Electron page shows both seq 47 and seq 48.

## Result

Passed on macOS against deployed Server/stable release `0.1.85-dev`:

- observed two `{"type":"heartbeat"}` frames, with the second arriving 15.624 seconds after the first;
- restarted the deployed Server while the client connection remained open;
- client reconnected and repaired `after=47` with exactly `[48]`;
- inspected the real installed Electron accessibility tree and found the user's sine request followed by
  `已用 Python 绘制 y = sin(x)…`;
- Server workspace tests passed; GUI 13 tests and production build passed;
- published GUI `0.1.50-dev`; Core `0.1.62-dev`, Skill `0.1.40-dev`, and Electron `0.1.19-dev` did not change.

## Design impact

An `onclose`-only reconnect policy is invalid for a desktop WebSocket behind proxies, NAT and system
sleep. Conversation sockets require an observable application heartbeat plus a client watchdog, while
all correctness and recovery continue to use the existing monotonic message cursor.
