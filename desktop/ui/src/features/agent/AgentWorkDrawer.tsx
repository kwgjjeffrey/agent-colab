import { traceTargets } from "@/api/trace-locators";
import { runOperation } from "@/api/operation-runner";
import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { workTranscript } from "./work-transcript";
import { ToolExecutionGroup, groupConsecutiveTools } from "./ToolExecutionCard";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { messageRequest } from "@/features/messages/api";

export type AgentWorkRequest = {
  id: string;
  state: string;
  targetName: string;
  summary?: string;
};
type WorkDetails = {
  requestId: string;
  state: string;
  targetName: string;
  events: Record<string, unknown>[];
};
const activeStates = new Set([
  "queued",
  "delivering",
  "running",
  "awaiting_owner",
]);
export function workLabel(request: AgentWorkRequest) {
  return activeStates.has(request.state) ? "Working" : "Work details";
}
function WorkMarkdown({ text }: { text: string }) {
  return (
    <div className="work-markdown min-w-0 text-sm leading-relaxed break-words">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) =>
            href && /^(colab:|colab-mention:|colab-resource:)/.test(href) ? (
              <span className="rounded bg-accent px-1 font-medium">
                {children}
              </span>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {children}
              </a>
            ),
        }}
        urlTransform={(url) =>
          /^(colab:|colab-mention:|colab-resource:)/.test(url)
            ? url
            : /^(https?:|mailto:)/i.test(url)
              ? url
              : ""
        }
      >
        {text}
      </Markdown>
    </div>
  );
}

export function AgentWorkDrawer({
  request,
  open,
  onOpenChange,
}: {
  request?: AgentWorkRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [details, setDetails] = useState<WorkDetails>(),
    [error, setError] = useState<string>();
  useEffect(() => {
    if (!open || !request) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setDetails(undefined);
    setError(undefined);
    const read = () =>
      void runOperation("agents.work.read", async (operation) => {
        try {
          const value = await operation.message<WorkDetails>(
            `/v1/agent-requests/${request.id}/events`,
          );
          if (cancelled) operation.cancel();
          else {
            setDetails(value);
            setError(undefined);
            if (
              (activeStates.has(value.state) || !workTranscript(value.events).some(entry => entry.kind !== "instruction")) &&
              attempts++ < 15
            )
              timer = setTimeout(read, 2000);
          }
        } catch (reason) {
          operation.fail();
          if (!cancelled) setError(String(reason));
        }
      });
    read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, request?.id, request?.state, refresh]);
  const entries = workTranscript(details?.events ?? []);
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent
        data-trace-region={"agent-work"}
        data-trace-target={traceTargets("agents.work.read")}
        className="data-[swipe-axis=x]:w-[min(42rem,95vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:42rem]"
      >
        <DrawerHeader className="relative gap-2 pb-4 pr-12">
          <DrawerTitle className="text-lg">
            {request?.targetName ?? "Agent"} ·{" "}
            {request ? workLabel(request) : "Work details"}
          </DrawerTitle>
          <DrawerDescription>
            This task only · Oldest to newest
          </DrawerDescription>
          <DrawerClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close work details"
                className="absolute right-3 top-3"
              />
            }
          >
            <XIcon />
          </DrawerClose>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
          {entries.length === 0 && request?.summary && (
            <div className="mb-4">
              <WorkMarkdown text={request.summary} />
            </div>
          )}
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !details ? (
            <p className="text-sm text-muted-foreground">
              Loading work details…
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {activeStates.has(details.state)
                ? "The command is accepted. Detailed events appear when the turn finishes."
                : "The task has finished. Waiting for its recorded work; if none appears, this task has no captured transcript."}
            </p>
          ) : (
            <div className="flex flex-col gap-5" data-testid="work-transcript">
              {groupConsecutiveTools(entries, entry => entry.kind === "tool").map((group) => { const entry = group[0]; return (
                entry.kind === "tool" ? (
                  <ToolExecutionGroup key={entry.id} entries={group} />
                ) : entry.kind === "instruction" ? (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-primary/25 bg-primary/10 p-4"
                  >
                    <div className="mb-2 text-xs font-semibold">
                      Instruction
                    </div>
                    <WorkMarkdown text={entry.text} />
                  </div>
                ) : (
                  <div
                    key={entry.id}
                    className={entry.kind === "error" ? "text-destructive" : ""}
                  >
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      {entry.kind === "error"
                        ? "Execution failed"
                        : (request?.targetName ?? "Agent")}
                    </div>
                    <WorkMarkdown text={entry.text} />
                  </div>
                ));
              })}
            </div>
          )}
          {details && !activeStates.has(details.state) && !entries.some(entry => entry.kind !== "instruction") && (
            <div className="mt-4 flex flex-col gap-2">
              {request?.summary && entries.length > 0 && <WorkMarkdown text={request.summary} />}
              <p className="text-sm text-muted-foreground">Execution details have not arrived yet. The result and recorded process synchronize independently.</p>
              <Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Refresh work details</Button>
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
