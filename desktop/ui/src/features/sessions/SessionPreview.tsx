import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { catalogRequest } from "@/features/workspace/CatalogWorkspace";
import { PreviewMarkdown } from "@/features/workspace/PreviewMarkdown";
import { ToolExecutionGroup, groupConsecutiveTools } from "@/features/agent/ToolExecutionCard";
import { workTranscript } from "@/features/agent/work-transcript";
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
    status?: string;
    aggregatedOutput?: string;
    result?: unknown;
    output?: unknown;
  }>;
};
/** Selecting a Session reads a bounded page; discovery never reads conversations. */
export function SessionPreview({ id, feedback = false }: { id: string; feedback?: boolean }) {
  const [sync, setSync] = useState<{state:string; contributor?:boolean; uploadedBytes?:number; totalBytes?:number; error?:string}>();
  useEffect(() => {
    if (feedback) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setSync(undefined);
    async function poll() {
      try {
        const response = await fetch(`/v1/sessions/${id}/sync-status`);
        if (response.ok) {
          const status = await response.json();
          if (!stopped) setSync(status);
        }
      } finally { if (!stopped) timer = setTimeout(() => void poll().catch(() => {}), 3000); }
    }
    void poll().catch(() => {});
    return () => { stopped = true; clearTimeout(timer); };
  }, [id, feedback]);
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
  }, [id, feedback]);
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
          feedback ? `/v1/feedbacks/${id}/read` : `/v1/sessions/${id}/read`,
          "POST",
          {
            turnLimit: 5,
            includeOutputs: true,
            maxOutputCharsPerItem: 2000,
            ...(cursor ? { cursor } : {}),
          },
          operation,
        );
        if (current === generation.current) {
          setTurns((previous) =>
            cursor ? (feedback ? [...(previous ?? []), ...row.turns] : [...row.turns, ...(previous ?? [])]) : row.turns,
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
          {sync.state === "synced" ? "Synced" : sync.state === "failed" ? (sync.contributor ? "Sync failed — local preview is still available. Background sync will retry." : "Download failed — cached preview is still available.") : sync.state === "downloading" ? "Downloading updates — showing cached preview" : "Syncing"}
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
                {feedback ? "Load more messages" : "Load earlier messages"}
              </Button>
            )}
            {turns.flatMap((turn, turnIndex) =>
              groupConsecutiveTools(turn.items
                .filter(
                  (item) =>
                    typeof item.text === "string" ||
                    typeof item.content === "string" ||
                    Array.isArray(item.content) ||
                    item.type === "commandExecution" ||
                    item.type === "mcpToolCall" ||
                    ["dynamicToolCall", "fileChange", "webSearch", "imageGeneration", "collabAgentToolCall"].includes(item.type ?? ""),
                )
                , item => item.type !== "userMessage" && item.type !== "agentMessage").map((group, index) => { const item = group[0]; return (
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
                      <ToolExecutionGroup entries={group.map((item, toolIndex) => workTranscript([{
                        method: "item/completed",
                        params: { item: { ...item, id: item.id ?? `${turnIndex}:${index}:${toolIndex}`,
                          aggregatedOutput: item.aggregatedOutput ?? item.text ?? (typeof item.content === "string" ? item.content : undefined) } },
                      }])[0] ?? { id: `${turnIndex}:${index}`, kind: "tool", text: "", title: item.tool ?? item.type ?? "Tool", output: item.text })} />
                    )}
                  </div>
                ); }),
            )}
          </div>
        )}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
