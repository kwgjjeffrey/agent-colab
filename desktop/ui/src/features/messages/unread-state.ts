import { useEffect, useSyncExternalStore } from "react";
import { accountRealtime } from "@/api/realtime";
import { runOperation } from "@/api/operation-runner";

export type MessageReadState = {
  channelId: string;
  lastReadSeq: number;
  latestSeq: number;
  unreadCount: number;
  firstUnreadSeq: number | null;
};
type Snapshot = Readonly<Record<string, MessageReadState>>;
const empty: Snapshot = {};
let snapshot: Snapshot = empty;
let epoch = 0;
let refreshCurrent = () => {};
const listeners = new Set<() => void>();
function publish(value: Snapshot) {
  snapshot = value;
  listeners.forEach(listener => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function useUnreadMessages() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** One account stream feeds every badge; stale HTTP completions cannot cross accounts. */
export function useMessageUnreadAccount(accountId?: string) {
  useEffect(() => {
    const generation = ++epoch;
    publish(empty);
    if (!accountId) return;
    let running = false;
    let queued = false;
    const refresh = async () => {
      if (generation !== epoch) return;
      queued = true;
      if (running) return;
      running = true;
      try {
        do {
          queued = false;
          await runOperation("messages.unread.refresh", async operation => {
            const rows = await operation.message<MessageReadState[]>("/v1/messages/read-state", undefined, true);
            if (generation !== epoch) { operation.cancel(); return; }
            publish(Object.fromEntries(rows.map(row => [row.channelId, row])));
          });
          if (generation !== epoch) return;
        } while (queued);
      } catch {
        // Retain the last confirmed count. Reconnect/heartbeat retries failed reads.
      } finally { running = false; }
    };
    refreshCurrent = () => { void refresh(); };
    const unsubscribe = accountRealtime.subscribe(frame => {
      if (["messages.invalidated", "heartbeat", "realtime.connected"].includes(frame.type)) void refresh();
    });
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    void refresh();
    return () => {
      ++epoch;
      refreshCurrent = () => {};
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      publish(empty);
    };
  }, [accountId]);
  return useUnreadMessages();
}

export async function acknowledgeMessages(channelId: string, seq: number) {
  const generation = epoch;
  await runOperation("messages.unread.acknowledge", operation => operation.message(`/v1/channels/${channelId}/messages/read-state`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastReadSeq: seq }),
  }, true));
  if (generation === epoch) refreshCurrent();
}
