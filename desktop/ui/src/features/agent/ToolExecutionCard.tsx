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
                    <CollapsibleTrigger aria-label={`${entry.title ?? "Tool call"} ${entry.status || "Tool"}`} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
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
  );
}
