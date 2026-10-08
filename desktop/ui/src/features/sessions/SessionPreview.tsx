import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { catalogRequest } from "@/features/workspace/CatalogWorkspace";

type Turn = {
  items: Array<{ type?: string; text?: string; content?: string }>;
};
/** Preview is explicit: listing a Session never materializes its conversation. */
export function SessionPreview({ id }: { id: string }) {
  const [turns, setTurns] = useState<Turn[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setTurns(undefined);
    setError(undefined);
  }, [id]);
  async function read() {
    setLoading(true);
    setError(undefined);
    try {
      const row = await catalogRequest<{ turns: Turn[] }>(
        `/v1/sessions/${id}/read`,
        "POST",
        { turnLimit: 5, includeOutputs: false, maxOutputCharsPerItem: 2000 },
      );
      setTurns(row.turns);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="flex min-h-0 flex-col gap-3 px-4">
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
              : "Preview recent messages"}
        </Button>
      </div>
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
                  typeof item.content === "string",
              )
              .map((item, index) => (
                <div
                  key={`${turnIndex}:${index}`}
                  className="flex flex-col gap-1"
                >
                  <span className="text-xs text-muted-foreground">
                    {item.type}
                  </span>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {item.text ?? item.content}
                  </p>
                </div>
              )),
          )}
        </div>
      )}
    </div>
  );
}
