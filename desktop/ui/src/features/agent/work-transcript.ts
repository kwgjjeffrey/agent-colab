type RecordValue = Record<string, unknown>;
export type WorkEntry = {
  id: string;
  kind: "instruction" | "response" | "tool" | "error";
  text: string;
  title?: string;
  input?: string;
  output?: string;
  status?: string;
};
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" ? (value as RecordValue) : {};
const text = (value: unknown): string =>
  typeof value === "string" ? value : "";
const printable = (value: unknown): string =>
  value == null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
const toolTypes = new Set([
  "commandExecution",
  "mcpToolCall",
  "dynamicToolCall",
  "fileChange",
  "webSearch",
  "imageGeneration",
  "collabAgentToolCall",
]);

/** Preserve provider event order, coalescing snapshots/deltas by item identity.
 * Protocol lifecycle, token accounting and MCP startup are not conversation items. */
export function workTranscript(events: RecordValue[]): WorkEntry[] {
  const items = new Map<string, RecordValue>();
  const order: string[] = [];
  const add = (item: RecordValue) => {
    const id = text(item.id);
    if (!id) return;
    if (!items.has(id)) order.push(id);
    items.set(id, { ...items.get(id), ...item });
  };
  for (const event of events) {
    const params = record(event.params),
      method = text(event.method);
    if (method === "item/started" || method === "item/completed")
      add(record(params.item));
    else if (method === "item/agentMessage/delta") {
      const id = text(params.itemId),
        previous = items.get(id);
      add({
        ...previous,
        id,
        type: "agentMessage",
        text: text(previous?.text) + text(params.delta),
      });
    } else if (method === "turn/completed") {
      const turn = record(params.turn);
      if (Array.isArray(turn.items))
        turn.items.forEach((item) => add(record(item)));
      if (turn.error)
        add({
          id: `error-${text(turn.id)}`,
          type: "error",
          text: text(record(turn.error).message) || "Agent execution failed.",
        });
    } else if (method === "error" && !params.willRetry) {
      add({
        id: `error-${order.length}`,
        type: "error",
        text:
          text(record(params.error).message) ||
          text(params.message) ||
          "Agent execution failed.",
      });
    }
  }
  return order.flatMap<WorkEntry>((id) => {
    const item = items.get(id)!,
      type = text(item.type);
    if (type === "userMessage") {
      const content = Array.isArray(item.content)
        ? item.content
            .map((value) => {
              const part = record(value);
              return (
                text(part.text) || (part.type === "image" ? "[Image]" : "")
              );
            })
            .filter(Boolean)
            .join("\n")
        : text(item.text);
      return content
        ? [{ id, kind: "instruction" as const, text: content }]
        : [];
    }
    if (type === "agentMessage" || type === "error")
      return text(item.text)
        ? [
            {
              id,
              kind:
                type === "error" ? ("error" as const) : ("response" as const),
              text: text(item.text),
            },
          ]
        : [];
    if (!toolTypes.has(type)) return [];
    const command = text(item.command),
      tool = text(item.tool) || text(item.name);
    const title =
      type === "commandExecution"
        ? "Run command"
        : tool ||
          (
            {
              fileChange: "Edit files",
              webSearch: "Search web",
              imageGeneration: "Generate image",
              collabAgentToolCall: "Agent delegation",
            } as Record<string, string>
          )[type] ||
          "Tool call";
    return [
      {
        id,
        kind: "tool" as const,
        title,
        text: "",
        status: text(item.status),
        input:
          command ||
          printable(
            item.arguments ?? item.input ?? item.changes ?? item.action,
          ),
        output:
          text(item.aggregatedOutput) ||
          printable(item.result ?? item.output ?? item.error),
      },
    ];
  });
}
