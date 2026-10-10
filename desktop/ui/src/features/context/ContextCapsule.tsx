import { traceTargets } from "@/api/trace-locators";
import { beginOperation } from "@/api/telemetry";
import { operations } from "@/api/trace-operations";
import { ContextIcon } from "./ContextIcon";
import { useEffect, useState } from "react";
import { messageRequest } from "@/features/messages/api";
import type { ChannelMessage } from "@/features/messages/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useChannelContext } from "./ChannelContext";
import type { ContextResource, ResourceKind } from "./context-model";
export function ContextCapsule({
  kind,
  id,
  label,
}: {
  kind: ResourceKind;
  id: string;
  label: string;
}) {
  const [open, setOpen] = useState(false),
    [resolved, setResolved] = useState<ContextResource>(),
    [failure, setFailure] = useState(false),
    [loading, setLoading] = useState(false);
  const context = useChannelContext(),
    resource =
      resolved ??
      context?.resources.find((row) => row.kind === kind && row.id === id);
  useEffect(() => {
    if (!open || !context) return;
    let alive = true;
    setLoading(true);
    setFailure(false);
    setResolved(undefined);
    const operation=beginOperation(operations["context.preview"]);
    const load =
      kind === "message"
        ? messageRequest<ChannelMessage>(
            `/v1/channels/${context.channelId}/messages/${id}`,
            undefined,
            true,
            operation,
          ).then((row) => {
            if (alive)
              setResolved({
                kind,
                id,
                channelId: context.channelId,
                name: `Message ${row.seq}`,
                contributorName: row.senderName,
                updatedAt: row.createdAt,
                excerpt: row.body.slice(0, 240),
              });
          })
        : context.lookup(kind, id, operation).then((row) => {
            if (alive) setResolved(row);
          });
    void load
      .catch(() => {
        operation.finish("error","preview.failed");
        if (alive) setFailure(true);
      })
      .finally(() => {
        if (alive) {setLoading(false);operation.finish("success","preview.state_committed");} else operation.finish("cancelled","view.closed");
      });
    return () => {
      alive = false;
      operation.finish("cancelled","view.closed");
    };
  }, [open, context?.channelId, kind, id]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-trace-target={traceTargets("context.preview", "context.lookup")}
        render={<button type="button" className="resource-mention max-w-60 cursor-pointer" title={resource?.name ?? label} aria-label={resource?.name ?? label} />}
      >
        <ContextIcon kind={kind} name={resource?.name ?? label} />
        <span className="min-w-0 truncate">{resource?.name ?? label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <div className="flex flex-col gap-2">
          <strong className="break-words">{resource?.name ?? label}</strong>
          <p className="text-xs capitalize text-muted-foreground">{kind}</p>
          {resource && !failure ? (
            <>
              <p className="text-sm text-muted-foreground">
                {resource.contributorName
                  ? `Shared by ${resource.contributorName}`
                  : "Shared in this Channel"}
              </p>
              {resource.updatedAt && (
                <time className="text-xs text-muted-foreground">
                  Updated {new Date(resource.updatedAt).toLocaleString()}
                </time>
              )}
              {resource.excerpt && (
                <p className="line-clamp-3 text-sm">{resource.excerpt}</p>
              )}
              <Button
                size="sm"
                disabled={loading}
                onClick={() => {
                  setOpen(false);
                  context?.navigate(resource);
                }}
              >
                Go to Detail
              </Button>
            </>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {loading
                ? "Loading context…"
                : failure || context?.error
                  ? "Unable to load this context."
                  : "This context is unavailable or has been withdrawn."}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
