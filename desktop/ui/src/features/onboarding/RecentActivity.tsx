import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useChannelContext } from "@/features/context/ChannelContext";
import type { ContextResource } from "@/features/context/context-model";
import { messageRequest } from "@/features/messages/api";
import {
  AgentWorkDrawer,
  type AgentWorkRequest,
} from "@/features/agent/AgentWorkDrawer";
import { MentionCapsule } from "@/features/context/MentionCapsule";
import type { MessageNode } from "@/features/messages/types";

export type Activity = {
  id: string;
  action: "shared" | "read" | "requested" | "created";
  actorName: string;
  actorMemberId?: string;
  resourceKind: ContextResource["kind"];
  resourceId: string;
  resourceName: string;
  occurredAt: string;
  targetName?: string;
  targetBlueprintId?: string;
  previewContent?: MessageNode;
  source?: string;
  state?: string;
};
type Cursor = { before: string; beforeId: string };
type Page = { items: Activity[]; nextCursor: Cursor | null };
export function RecentActivity() {
  const context = useChannelContext();
  const channelId = context?.channelId;
  const [rows, setRows] = useState<Activity[]>([]);
  const [work, setWork] = useState<AgentWorkRequest>();
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
    setWork(undefined);
    void load();
  }, [load]);
  const openActivity = (row: Activity) => {
    if (row.action === "requested")
      setWork({
        id: row.id.slice("request:".length),
        state: row.state ?? "unknown",
        targetName: row.targetName ?? "Agent",
      });
    else
      context?.navigate({
        id: row.resourceId,
        kind: row.resourceKind,
        name: row.resourceName,
        channelId: channelId!,
      });
  };
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
          <div
            role="link"
            tabIndex={0}
            aria-label={`${row.actorName} ${row.action} ${row.resourceName}`}
            className="flex cursor-pointer items-start justify-between gap-4 rounded-md px-2 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => openActivity(row)}
            onKeyDown={(event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                openActivity(row);
              }
            }}
          >
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm">
                <span
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {row.actorMemberId ? (
                    <MentionCapsule
                      kind="member"
                      id={row.actorMemberId}
                      label={row.actorName}
                    />
                  ) : (
                    <span className="font-medium">{row.actorName}</span>
                  )}
                </span>{" "}
                {row.action === "requested" ? (
                  <>
                    sent an instruction to{" "}
                    <span
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <MentionCapsule
                        kind="agent"
                        id={row.targetBlueprintId}
                        label={row.targetName ?? "Agent"}
                      />
                    </span>{" "}
                    via {row.source ?? "Messages"}.
                  </>
                ) : row.action === "read" ? (
                  "read"
                ) : row.action === "created" ? (
                  "created"
                ) : (
                  "shared"
                )}
                {row.action !== "requested" && (
                  <>
                    {" "}
                    <span
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <MentionCapsule
                        kind={row.resourceKind}
                        id={row.resourceId}
                        label={row.resourceName}
                      />
                    </span>
                    .
                  </>
                )}
              </p>
              <div className="line-clamp-2 text-xs font-normal leading-5 text-muted-foreground">
                {row.action === "requested" ? (
                  <>
                    <ActivityPreview
                      node={row.previewContent}
                      fallback={row.resourceName}
                    />{" "}
                    · {row.state ?? "unknown"}
                  </>
                ) : (
                  `${row.resourceKind === "session" ? "Session" : row.resourceKind === "canvas" ? "Canvas" : "Files"} · Open details`
                )}
              </div>
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
      <AgentWorkDrawer
        request={work}
        open={Boolean(work)}
        onOpenChange={(open) => {
          if (!open) setWork(undefined);
        }}
      />
    </section>
  );
}

function ActivityPreview({
  node,
  fallback,
}: {
  node?: MessageNode;
  fallback: string;
}) {
  if (!node?.content?.length) return <>{fallback}</>;
  return (
    <>
      {node.content.map((item, index) =>
        item.type === "mention" ? (
          <span
            key={index}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <MentionCapsule
              kind={item.attrs?.kind}
              id={item.attrs?.id}
              label={item.attrs?.label ?? "Context"}
            />
          </span>
        ) : (
          (item.text ?? " ")
        ),
      )}
    </>
  );
}
