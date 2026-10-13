# Message unread implementation

Rollback baseline: `a582517`. Existing unrelated work remains in the working tree.

The same private, Server-owned reading cursor drives Message, Channel and native
application badges. Incoming human and Agent messages count; one's own human
messages do not. Existing history is initialized as read on migration. New
members start at the Channel's current sequence. Read cursors only advance.

The GUI acknowledges the latest rendered sequence only while Message is visible,
the window has focus and the timeline is at the bottom. Reading history never
forces a scroll. Realtime hints, reconnect and heartbeat reconcile durable state.
Read state is private to the account; no public read receipts are introduced.

Implementation and acceptance:

- [x] Add membership-scoped cursor, authorized summary and monotonic acknowledgement.
- [x] Proxy through Core and reconcile account-scoped GUI state.
- [x] Connect Message/Channel badges, unread divider and new-message navigation.
- [x] Connect native application badge through restricted Shell IPC.
- [x] Verify two-account delivery, history scrolling, focus, reconnect and stale acknowledgements.
- [x] Record verified results for the scoped commit.

Acceptance: isolated PostgreSQL contract passed; GUI regression Run
`20261013T083354Z-662d3860` passed with two real authenticated Core clients and
Server. It covers incoming/own messages, history scroll preservation, jump to
latest, actual background-tab focus and heartbeat reconciliation of an independent
client acknowledgement. Playwright focus emulation is disabled for the focus
checks. Earlier test-fixture/login and test timing failures remain in the run chain.
Four hook/store tests cover stale account responses, reconnect failure/recovery
and focus gating. Shell IPC security test passed. Actual Electron 40.8.2 on macOS
verified the production preload/IPC setting the OS badge to 7 and clearing to 0.
Registry check passed (178 operations); remote telemetry delivery is not claimed.

Rollout order: Server migration/API, then Core and GUI, then independently
versioned Shell for native badges. Older Shells keep in-app/browser reminders.
The additive migration is backward compatible with old clients; rollback can
retain the reading cursor column and trigger. No production migration or artifact
promotion has been performed by this change yet. macOS is the native acceptance
target; Windows overlay icons are not implemented by `app.setBadgeCount`.
