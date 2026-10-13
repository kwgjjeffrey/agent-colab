import { useEffect, useRef, useState, type RefObject } from "react";
import { acknowledgeMessages, useUnreadMessages } from "./unread-state";

export function useMessageReading(channelId: string, latestRendered: number, atBottom: boolean,
  viewport: RefObject<HTMLElement | null>) {
  const state = useUnreadMessages()[channelId];
  const [active, setActive] = useState(() => document.visibilityState === "visible" && document.hasFocus());
  const boundary = useRef<{ channel: string; seq: number | null } | undefined>(undefined);
  if (state && boundary.current?.channel !== channelId) boundary.current = { channel: channelId, seq: state.firstUnreadSeq };
  useEffect(() => {
    const update = () => setActive(document.visibilityState === "visible" && document.hasFocus());
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!active || !atBottom || !state || latestRendered <= state.lastReadSeq || latestRendered < state.latestSeq) return;
    const timer = window.setTimeout(() => {
      if (document.hasFocus() && document.visibilityState === "visible" && viewport.current?.getClientRects().length)
        void acknowledgeMessages(channelId, latestRendered).catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [channelId, latestRendered, atBottom, active, state, viewport]);
  return { unreadCount: state?.unreadCount ?? 0, firstUnreadSeq: boundary.current?.seq ?? state?.firstUnreadSeq };
}
