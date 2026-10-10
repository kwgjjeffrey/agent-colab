import { ChevronRightIcon, WrenchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { WorkEntry } from "./work-transcript";

/** Session and work details share the same collapsed execution presentation. */
export function ToolExecutionCard({ entry }: { entry: WorkEntry }) {
  return (
                  <Collapsible
                    defaultOpen={false}
                    className="rounded-md border"
                  >
                    <CollapsibleTrigger aria-label={`${entry.title ?? "Tool call"} ${entry.status || "Tool"}`} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-muted-foreground">
                      <ChevronRightIcon className="size-3 shrink-0 transition-transform in-data-open:rotate-90" />
                      <WrenchIcon className="size-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {entry.title}
                      </span>
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
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
  );
}

/** Only adjacent executions coalesce; a message always ends the group. */
export function groupConsecutiveTools<T>(items: T[], isTool: (item: T) => boolean): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const previous = groups[groups.length - 1];
    if (isTool(item) && previous && isTool(previous[0])) previous.push(item);
    else groups.push([item]);
  }
  return groups;
}

export function ToolExecutionGroup({ entries }: { entries: WorkEntry[] }) {
  if (entries.length === 1) return <ToolExecutionCard entry={entries[0]} />;
  return <Collapsible defaultOpen={false} className="rounded-md border border-border/60" data-tool-group>
    <CollapsibleTrigger aria-label={`${entries.length} tool calls`} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-muted-foreground">
      <ChevronRightIcon className="size-3 shrink-0 transition-transform in-data-open:rotate-90" />
      <WrenchIcon className="size-3 shrink-0" />
      <span>{entries.length} tool {entries.length === 1 ? "call" : "calls"}</span>
    </CollapsibleTrigger>
    <CollapsibleContent className="space-y-1 border-t border-border/60 p-2">
      {entries.map(entry => <ToolExecutionCard key={entry.id} entry={entry} />)}
    </CollapsibleContent>
  </Collapsible>;
}
