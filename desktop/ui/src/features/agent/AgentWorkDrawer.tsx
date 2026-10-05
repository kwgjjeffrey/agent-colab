import { traceTargets } from "@/api/trace-locators";
import { runOperation } from "@/api/operation-runner";
import { useEffect, useState } from "react";
import { ChevronRightIcon, WrenchIcon, XIcon } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { workTranscript } from "./work-transcript";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
            href?.startsWith("colab-mention:") ? (
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
          url.startsWith("colab-mention:")
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
  const [details, setDetails] = useState<WorkDetails>(),
    [error, setError] = useState<string>();
  useEffect(() => {
    if (!open || !request) return;
    let cancelled = false;
    setDetails(undefined);
    setError(undefined);
    void runOperation("agents.work.read", async (operation) => {
      try { const value=await operation.message<WorkDetails>(`/v1/agent-requests/${request.id}/events`); if (cancelled) operation.cancel(); else setDetails(value); }
      catch(reason) { operation.fail(); if (!cancelled) setError(String(reason)); }
    });
    return () => {
      cancelled = true;
    };
  }, [open, request?.id, request?.state]);
  const entries = workTranscript(details?.events ?? []);
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent data-trace-region={"agent-work"} data-trace-target={traceTargets("agents.work.read")} className="data-[swipe-axis=x]:w-[min(42rem,95vw)] data-[swipe-axis=x]:sm:[--drawer-content-width:42rem]">
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
                : "No provider events were captured for this older command."}
            </p>
          ) : (
            <div className="flex flex-col gap-5" data-testid="work-transcript">
              {entries.map((entry) =>
                entry.kind === "tool" ? (
                  <Collapsible
                    key={entry.id}
                    defaultOpen={false}
                    className="rounded-md border"
                  >
                    <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
                      <ChevronRightIcon className="transition-transform in-data-open:rotate-90" />
                      <WrenchIcon />
                      <span className="min-w-0 flex-1 truncate">
                        {entry.title}
                      </span>
                      <Badge variant="secondary">
                        {entry.status || "Tool"}
                      </Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="flex flex-col gap-3 border-t bg-muted/40 p-3">
                        {entry.input && (
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">
                              Input
                            </div>
                            <pre className="max-h-80 overflow-auto text-xs whitespace-pre-wrap break-words">
                              {entry.input}
                            </pre>
                          </div>
                        )}
                        {entry.output && (
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">
                              Output
                            </div>
                            <pre className="max-h-80 overflow-auto text-xs whitespace-pre-wrap break-words">
                              {entry.output}
                            </pre>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
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
                ),
              )}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
