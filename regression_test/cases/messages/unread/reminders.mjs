export const USECASE = {
  name: "Unread reminders follow Message, Channel and the app",
  description: "Two distinct authenticated members share an isolated Channel. Verify incoming and own-message counts, focus-gated reading, stable history scrolling, jump to latest, and cross-device convergence. The renderer forwards the confirmed aggregate to the native bridge; native IPC is tested separately."
};
export const META = {
  id: "communication.messages.unread", module: "messages/unread", surface: "gui",
  priority: "critical", origin: "requirement", status: "trial", effects: "isolated-write", cost: "normal",
  requires: ["local-core"], suite: "business", testLevel: "end-to-end",
  locks: ["write:channel.unread", "write:native.focus", "write:browser.loopback-auth"],
  affectedPaths: ["desktop/ui/src/features/messages", "server/standalone/crates/persistence/src/message_read_state.rs", "desktop/shell/electron/unread-badge.cjs"]
};
export const REQUIREMENTS = { channel: { permission: "read" }, parameters: { keys: ["secondCoreDiscoveryFile"] } };
import { core, parameter, resource, eventually } from "../../../support/client.mjs";
import { messageBody } from "../../../support/controls.mjs";

export async function run(ctx) {
  const channel = resource(ctx, "channel");
  const other = { discoveryFile: parameter(ctx, "secondCoreDiscoveryFile") };
  const current = await core(ctx, "GET", "/v1/auth/status");
  const second = await core(ctx, "GET", "/v1/auth/status", undefined, other);
  ctx.assert("Sender and reader are distinct accounts", current.user.id !== second.user.id, true);
  const page = ctx.page;
  await page.addInitScript(() => { window.colabHost = {
    isElectron: false, markUiReady() {}, onDeepLink: () => () => {},
    setUnreadCount: async count => { window.__unreadBadge = count; }
  }; });
  await page.reload();
  await page.getByRole("complementary", { name: "Channels" }).getByRole("button", { name: channel.name, exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const states = () => core(ctx, "GET", "/v1/messages/read-state");
  const initial = (await states()).find(row => row.channelId === channel.id);
  await core(ctx, "POST", `/v1/channels/${channel.id}/messages/read-state`, { lastReadSeq: initial.latestSeq });
  const sent = await core(ctx, "POST", `/v1/channels/${channel.id}/messages`, messageBody("Unread incoming " + ctx.runId), other);
  await eventually(ctx, "Incoming message updates the native aggregate", () => page.evaluate(() => window.__unreadBadge), n => n === 1);
  ctx.assert("Message entrance shows unread", await page.getByRole("button", { name: "Message", exact: true }).getAttribute("aria-description"), "1 unread messages");
  ctx.assert("Channel rail shows unread", await page.getByRole("complementary", { name: "Channels" }).getByLabel("1 unread messages", { exact: true }).count(), 1);
  await core(ctx, "POST", `/v1/channels/${channel.id}/messages`, messageBody("Own message " + ctx.runId));
  ctx.assert("Own human message does not increase unread", (await states()).find(row => row.channelId === channel.id).unreadCount, 1);
  await page.getByRole("button", { name: "Message", exact: true }).click();
  await page.bringToFront();
  await page.locator(`#message-${sent.id}`).waitFor();
  await eventually(ctx, "Visible latest messages clear all badges", () => page.evaluate(() => window.__unreadBadge), n => n === 0);
  let last;
  for (let i = 0; i < 5; i++) last = await core(ctx, "POST", `/v1/channels/${channel.id}/messages`, messageBody(`${ctx.runId} history ${i}\n` + "Conversation detail\n".repeat(16)), other);
  await page.locator(`#message-${last.id}`).waitFor();
  await eventually(ctx, "Following latest acknowledges incoming messages", async () => (await states()).find(row => row.channelId === channel.id).lastReadSeq, seq => seq >= last.seq);
  const timeline = page.locator(`[data-message-timeline="${channel.id}"]`);
  await timeline.hover();
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(500);
  const top = await timeline.evaluate(node => node.scrollTop);
  await core(ctx, "POST", `/v1/channels/${channel.id}/messages`, messageBody("New while reading history " + ctx.runId), other);
  await eventually(ctx, "History reading retains unread", () => page.evaluate(() => window.__unreadBadge), n => n === 1);
  ctx.assert("New messages preserve the history scroll position", Math.abs((await timeline.evaluate(node => node.scrollTop)) - top) < 3, true);
  await page.getByRole("button", { name: "1 new messages ↓", exact: true }).click();
  await eventually(ctx, "Jump to latest clears unread", () => page.evaluate(() => window.__unreadBadge), n => n === 0);
  const background = await ctx.newPage();
  // Playwright enables focus emulation per CDP target. Restore real tab focus
  // before checking the product's background-reading boundary.
  for (const target of [page, background]) {
    const cdp = await target.context().newCDPSession(target);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  }
  await background.goto("about:blank"); await background.bringToFront();
  ctx.assert("The reader tab is actually unfocused", await page.evaluate(() => document.hasFocus()), false);
  await core(ctx, "POST", `/v1/channels/${channel.id}/messages`, messageBody("Incoming in background " + ctx.runId), other);
  await eventually(ctx, "Background window does not acknowledge", async () => (await states()).find(row => row.channelId === channel.id).unreadCount, n => n === 1);
  await new Promise(resolve => setTimeout(resolve, 800));
  ctx.assert("Unread survives while unfocused", (await states()).find(row => row.channelId === channel.id).unreadCount, 1);
  await page.bringToFront();
  await eventually(ctx, "Returning focus acknowledges visible latest", () => page.evaluate(() => window.__unreadBadge), n => n === 0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const remoteRead = await core(ctx, "POST", `/v1/channels/${channel.id}/messages`, messageBody("Read on another client " + ctx.runId), other);
  await eventually(ctx, "Unread exists before another client's acknowledgement", () => page.evaluate(() => window.__unreadBadge), n => n === 1);
  // An independent API consumer advances the same account cursor. The GUI must
  // reconcile without a focus change or a new message invalidation.
  await core(ctx, "POST", `/v1/channels/${channel.id}/messages/read-state`, { lastReadSeq: remoteRead.seq });
  await eventually(ctx, "Heartbeat reconciles another client's read", () => page.evaluate(() => window.__unreadBadge), n => n === 0, { timeoutMs: 25000 });
  await ctx.screenshot("unread-message-workspace");
}
