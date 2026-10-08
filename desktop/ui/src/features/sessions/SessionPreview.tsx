import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { catalogRequest } from "@/features/workspace/CatalogWorkspace";
import { PreviewMarkdown } from "@/features/workspace/PreviewMarkdown";

type Turn = {
  items: Array<{ type?: string; text?: string; content?: string | Array<{text?:string}> }>;
};
/** Selecting a Session reads a bounded page; discovery never reads conversations. */
export function SessionPreview({ id }: { id: string }) {
  const [turns, setTurns] = useState<Turn[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [warnings, setWarnings] = useState<Array<{code:string;count:number}>>([]);
  const generation = useRef(0);
  useEffect(() => {
    setTurns(undefined);
    setError(undefined);
    setWarnings([]);
    void read();
    return () => { generation.current += 1; };
  }, [id]);
  async function read() {
    const current = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      const row = await catalogRequest<{ turns: Turn[]; warnings?:Array<{code:string;count:number}> }>(
        `/v1/sessions/${id}/read`,
        "POST",
        { turnLimit: 5, includeOutputs: false, maxOutputCharsPerItem: 2000 },
      );
      if (current === generation.current) { setTurns(row.turns); setWarnings(row.warnings ?? []); }
    } catch (reason) {
      if (current === generation.current) setError(String(reason));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  return (
    <div className="flex min-h-0 flex-col gap-3 px-4" data-trace-region="session-preview">
      {warnings.map(warning=><p key={warning.code} role="status" className="text-xs text-muted-foreground">{warning.count} damaged source record(s) could not be decoded. The remaining conversation is shown; the original snapshot is unchanged.</p>)}
      {error && <div>
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
      </div>}
      {loading && <p className="text-sm text-muted-foreground">Loading conversation…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {turns && (
        <div className="flex flex-col gap-4">
          {turns.flatMap((turn, turnIndex) =>
            turn.items
              .filter(
                (item) =>
                  typeof item.text === "string" ||
                  typeof item.content === "string" || Array.isArray(item.content),
              )
              .map((item, index) => (
                <div
                  key={`${turnIndex}:${index}`}
                  className="flex flex-col gap-1"
                >
                  <span className="text-xs text-muted-foreground">
                    {item.type === "userMessage" ? "User" : "Agent"}
                  </span>
                  <div data-session-message>
                    <PreviewMarkdown>
                    {item.text ?? (typeof item.content === "string" ? item.content : item.content?.map(block=>block.text ?? "").join("\n")) ?? ""}
                    </PreviewMarkdown>
                  </div>
                </div>
              )),
          )}
        </div>
      )}
    </div>
  );
}
