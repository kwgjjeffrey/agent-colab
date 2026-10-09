import { useCallback, useEffect, useRef, useState } from "react";
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
type Page = { items: Activity[]; total: number; page: number; pageSize: number };
const PAGE_SIZE = 20;
export function RecentActivity() {
  const context = useChannelContext();
  const channelId = context?.channelId;
  const [rows, setRows] = useState<Activity[]>([]);
  const [work, setWork] = useState<AgentWorkRequest>();
  const [pageNumber, setPageNumber] = useState(1);
  const [total, setTotal] = useState(0);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const load = useCallback(
    async (number = 1) => {
      if (!channelId) return;
      const request = ++generation.current;
      setBusy(true);
      setError(undefined);
      try {
        const query = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(number) });
        const page = await messageRequest<Page>(`/v1/channels/${channelId}/activity?${query}`, undefined, true);
        if (request !== generation.current) return;
        setRows(page.items);
        setTotal(page.total);
        setPageNumber(page.page);
      } catch {
        if (request === generation.current) setError("Could not load recent activity.");
      } finally {
        if (request === generation.current) setBusy(false);
      }
    },
    [channelId],
  );
  useEffect(() => {
    setWork(undefined);
    setRows([]);
    setTotal(0);
    setPageNumber(1);
    void load();
    return () => { generation.current++; };
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
  if (!rows.length && !error) return null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const numbers = pages <= 7 ? Array.from({ length: pages }, (_, index) => index + 1) : Array.from(new Set([1, pages, ...Array.from({ length: 5 }, (_, index) => pageNumber + index - 2).filter(number => number > 0 && number <= pages)])).sort((a, b) => a - b);
  return (
    <section className="flex flex-col gap-3" aria-label="Recent activity">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Recent activity <span className="ml-2 text-sm font-normal text-muted-foreground">{total} activities</span></h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void load(pageNumber)}
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
            onClick={() => void load(pageNumber)}
          >
            Retry
          </Button>
        </div>
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
      {total > 0 && <nav aria-label="Recent activity pages" className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
        <span className="text-muted-foreground">{(pageNumber - 1) * PAGE_SIZE + 1}–{Math.min(pageNumber * PAGE_SIZE, total)} of {total}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={busy || pageNumber === 1} onClick={() => void load(pageNumber - 1)}>Previous</Button>
          {numbers.map((number, index) => <span key={number} className="flex items-center gap-1">{index > 0 && number - numbers[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-muted-foreground">…</span>}<Button size="sm" variant={number === pageNumber ? "secondary" : "ghost"} aria-label={`Activity page ${number}`} aria-current={number === pageNumber ? "page" : undefined} disabled={busy} onClick={() => void load(number)}>{number}</Button></span>)}
          <Button size="sm" variant="ghost" disabled={busy || pageNumber === pages} onClick={() => void load(pageNumber + 1)}>Next</Button>
        </div>
      </nav>}
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
