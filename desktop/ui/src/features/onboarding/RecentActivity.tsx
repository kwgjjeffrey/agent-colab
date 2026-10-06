import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useChannelContext } from "@/features/context/ChannelContext";
import type { ContextResource } from "@/features/context/context-model";
import { messageRequest } from "@/features/messages/api";

export type Activity = {
  id: string;
  action: "shared" | "read" | "requested" | "created";
  actorName: string;
  resourceKind: ContextResource["kind"];
  resourceId: string;
  resourceName: string;
  occurredAt: string;
  targetName?: string;
  source?: string;
  state?: string;
};
type Cursor = { before: string; beforeId: string };
type Page = { items: Activity[]; nextCursor: Cursor | null };
export function RecentActivity() {
  const context = useChannelContext();
  const channelId = context?.channelId;
  const [rows, setRows] = useState<Activity[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const load = useCallback(
    async (next?: Cursor) => {
      if (!channelId) return;
      setBusy(true);
      setError(undefined);
      try {
        const query = new URLSearchParams({ limit: "20", ...next });
        const page = await messageRequest<Page>(
          `/v1/channels/${channelId}/activity?${query}`,
          undefined,
          true,
        );
        setRows((previous) =>
          next
            ? [
                ...new Map(
                  [...previous, ...page.items].map((row) => [row.id, row]),
                ).values(),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
      } catch {
        setError("Could not load recent activity.");
      } finally {
        setBusy(false);
      }
    },
    [channelId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="flex flex-col gap-3" aria-label="Recent activity">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Recent activity</h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>
      {error && (
        <div role="alert" className="text-sm text-muted-foreground">
          {error}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      )}
      {!rows.length && !error && (
        <p className="text-sm text-muted-foreground">
          {busy ? "Loading activity…" : "No activity yet."}
        </p>
      )}
      {rows.map((row, index) => (
        <div key={row.id}>
          {index > 0 && <Separator />}
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm">
                <span className="font-medium">{row.actorName}</span>{" "}
                {row.action === "requested"
                  ? `sent an instruction to ${row.targetName} via ${row.source}`
                  : row.action === "read"
                    ? "read"
                    : row.action === "created"
                      ? "created"
                      : "shared"}
              </p>
              {row.action === "requested" ? (
                <p className="truncate text-sm text-muted-foreground">
                  {row.resourceName} · {row.state}
                </p>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-w-full justify-start"
                  onClick={() =>
                    context?.navigate({
                      id: row.resourceId,
                      kind: row.resourceKind,
                      name: row.resourceName,
                      channelId: channelId!,
                    })
                  }
                >
                  <span className="truncate">{row.resourceName}</span>
                </Button>
              )}
            </div>
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={row.occurredAt}
            >
              {new Date(row.occurredAt).toLocaleString()}
            </time>
          </div>
        </div>
      ))}
      {cursor && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          {busy ? "Loading…" : "Load more"}
        </Button>
      )}
    </section>
  );
}
