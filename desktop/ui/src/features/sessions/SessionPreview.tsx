import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { catalogRequest } from "@/features/workspace/CatalogWorkspace";
import { PreviewMarkdown } from "@/features/workspace/PreviewMarkdown";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { runOperation } from "@/api/operation-runner";
import { traceTargets } from "@/api/trace-locators";
import { StickToBottom, type StickToBottomContext } from "use-stick-to-bottom";

type Turn = {
  id?: string;
  items: Array<{
    id?: string;
    type?: string;
    tool?: string;
    command?: unknown;
    arguments?: unknown;
    text?: string;
    content?: string | Array<{ text?: string }>;
  }>;
};
/** Selecting a Session reads a bounded page; discovery never reads conversations. */
export function SessionPreview({ id }: { id: string }) {
  const [sync, setSync] = useState<{state:string; contributor?:boolean; uploadedBytes?:number; totalBytes?:number; error?:string}>();
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setSync(undefined);
    async function poll() {
      try {
        const response = await fetch(`/v1/sessions/${id}/sync-status`);
        if (response.ok && !stopped) setSync(await response.json());
      } finally { if (!stopped) timer = setTimeout(() => void poll().catch(() => {}), 3000); }
    }
    void poll().catch(() => {});
    return () => { stopped = true; clearTimeout(timer); };
  }, [id]);
  const [turns, setTurns] = useState<Turn[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [warnings, setWarnings] = useState<
    Array<{ code: string; count: number }>
  >([]);
  const [olderCursor, setOlderCursor] = useState<string>();
  const generation = useRef(0);
  const scrolling = useRef<StickToBottomContext>(null);
  useEffect(() => {
    setTurns(undefined);
    setError(undefined);
    setWarnings([]);
    setOlderCursor(undefined);
    void read();
    return () => {
      generation.current += 1;
    };
  }, [id]);
  async function read(cursor?: string) {
    const viewport = scrolling.current?.scrollRef.current;
    const previousHeight = viewport?.scrollHeight ?? 0;
    const previousTop = viewport?.scrollTop ?? 0;
    if (cursor) scrolling.current?.stopScroll();
    return runOperation("sessions.preview", async (operation) => {
      const current = ++generation.current;
      setLoading(true);
      setError(undefined);
      try {
        const row = await catalogRequest<{
          turns: Turn[];
          page?: { hasMore: boolean; nextCursor?: string };
          warnings?: Array<{ code: string; count: number }>;
        }>(
          `/v1/sessions/${id}/read`,
          "POST",
          {
            turnLimit: 5,
            includeOutputs: false,
            maxOutputCharsPerItem: 2000,
            ...(cursor ? { cursor } : {}),
          },
          operation,
        );
        if (current === generation.current) {
          setTurns((previous) =>
            cursor ? [...row.turns, ...(previous ?? [])] : row.turns,
          );
          setWarnings(row.warnings ?? []);
          setOlderCursor(row.page?.hasMore ? row.page.nextCursor : undefined);
          if (cursor) requestAnimationFrame(() => {
            if (viewport) viewport.scrollTop = previousTop + viewport.scrollHeight - previousHeight;
          });
        } else operation.cancel();
      } catch (reason) {
        operation.fail();
        if (current === generation.current) setError(String(reason));
      } finally {
        if (current === generation.current) setLoading(false);
      }
    });
  }
  return (
    <StickToBottom
      contextRef={scrolling}
      key={id}
      initial="instant"
      resize="instant"
      className="flex min-h-0 flex-1 flex-col"
      data-trace-region="session-preview"
      data-trace-target={traceTargets("sessions.preview")}
    >
      <StickToBottom.Content
        className="flex flex-col gap-3 px-4 pb-4"
        scrollClassName="min-h-0 flex-1 overflow-y-auto"
      >
        {sync && sync.state !== "unknown" && <p role="status" className="text-sm text-muted-foreground">
          {sync.state === "synced" ? "Synced" : sync.state === "failed" ? "Sync failed — local preview is still available. Background sync will retry." : sync.state === "downloading" ? "Downloading updates — showing cached preview" : "Syncing"}
          {sync.state !== "synced" && sync.totalBytes !== undefined && ` · ${((sync.uploadedBytes ?? 0) / 1048576).toFixed(1)} / ${(sync.totalBytes / 1048576).toFixed(1)} MiB uploaded`}
        </p>}
        {warnings.map((warning) => (
          <p
            key={warning.code}
            role="status"
            className="text-xs text-muted-foreground"
          >
            {warning.count} damaged source record(s) could not be decoded. The
            remaining conversation is shown; the original snapshot is unchanged.
          </p>
        ))}
        {error && (
          <div>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void read()}
            >
              {loading
                ? "Loading preview…"
                : turns
                  ? "Refresh preview"
                  : "Retry preview"}
            </Button>
          </div>
        )}
        {loading && (
          <p className="text-sm text-muted-foreground">Loading conversation…</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {turns && (
          <div className="flex flex-col gap-4">
            {olderCursor && (
              <Button
                variant="ghost"
                disabled={loading}
                onClick={() => void read(olderCursor)}
              >
                Load earlier messages
              </Button>
            )}
            {turns.flatMap((turn, turnIndex) =>
              turn.items
                .filter(
                  (item) =>
                    typeof item.text === "string" ||
                    typeof item.content === "string" ||
                    Array.isArray(item.content) ||
                    item.type === "commandExecution" ||
                    item.type === "mcpToolCall",
                )
                .map((item, index) => (
                  <div
                    key={`${turn.id ?? turnIndex}:${item.id ?? index}`}
                    className="flex flex-col gap-1"
                  >
                    {item.type === "userMessage" ||
                    item.type === "agentMessage" ? (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {item.type === "userMessage" ? "User" : "Agent"}
                        </span>
                        <div data-session-message>
                          <PreviewMarkdown>
                            {item.text ??
                              (typeof item.content === "string"
                                ? item.content
                                : item.content
                                    ?.map((block) => block.text ?? "")
                                    .join("\n")) ??
                              ""}
                          </PreviewMarkdown>
                        </div>
                      </>
                    ) : (
                      <Collapsible>
                        <CollapsibleTrigger
                          render={<Button variant="ghost" size="sm" />}
                        >
                          {item.tool ??
                            (item.type === "commandExecution"
                              ? "Command"
                              : (item.type ?? "Tool"))}
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <PreviewMarkdown>
                            {item.text ??
                              (typeof item.content === "string"
                                ? item.content
                                : item.content
                                    ?.map((block) => block.text ?? "")
                                    .join("\n")) ??
                              (typeof item.command === "string"
                                ? item.command
                                : JSON.stringify(
                                    item.arguments ?? item.command ?? {},
                                    null,
                                    2,
                                  ))}
                          </PreviewMarkdown>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )),
            )}
          </div>
        )}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
