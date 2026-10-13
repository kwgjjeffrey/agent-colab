// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ request: vi.fn(), listener: undefined as undefined | ((frame: { type: string }) => void) }));
vi.mock("@/api/realtime", () => ({ accountRealtime: { subscribe: (fn: typeof mock.listener) => { mock.listener = fn; return () => { mock.listener = undefined; }; } } }));
vi.mock("@/api/operation-runner", () => ({ runOperation: (_id: string, action: any) => action({ message: mock.request, cancel() {} }) }));
import { useMessageUnreadAccount } from "./unread-state";
afterEach(() => { cleanup(); mock.request.mockReset(); });
const row = (channelId: string, unreadCount: number) => ({ channelId, unreadCount, lastReadSeq: 0, latestSeq: unreadCount, firstUnreadSeq: 1 });
it("drops an old account's delayed response after switching accounts", async () => {
  let resolveOld!: (value: unknown) => void;
  mock.request.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce([row("new", 2)]);
  const hook = renderHook(({ account }) => useMessageUnreadAccount(account), { initialProps: { account: "old" } });
  hook.rerender({ account: "new" });
  await waitFor(() => expect(hook.result.current.new?.unreadCount).toBe(2));
  await act(async () => resolveOld([row("old", 8)]));
  expect(hook.result.current.old).toBeUndefined();
  hook.rerender({ account: "" });
  expect(hook.result.current).toEqual({});
});
it("keeps confirmed counts on failure and reconciles other-device reads on heartbeat", async () => {
  mock.request.mockResolvedValueOnce([row("a", 3)])
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([row("a", 0)]);
  const hook = renderHook(() => useMessageUnreadAccount("a"));
  await waitFor(() => expect(hook.result.current.a?.unreadCount).toBe(3));
  await act(async () => mock.listener?.({ type: "realtime.connected" }));
  expect(hook.result.current.a?.unreadCount).toBe(3);
  await act(async () => mock.listener?.({ type: "heartbeat" }));
  await waitFor(() => expect(hook.result.current.a?.unreadCount).toBe(0));
});
