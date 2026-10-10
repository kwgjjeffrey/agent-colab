import { describe, expect, it } from "vitest";
import { workTranscript } from "./work-transcript";
const event = (method: string, params: Record<string, unknown>) => ({
  method,
  params,
});
describe("task conversation projection", () => {
  it("keeps instruction, commentary, tools and answer in forward order without protocol noise", () => {
    const events = [
      event("turn/started", {}),
      event("mcpServer/startupStatus/updated", {}),
      event("item/completed", {
        item: {
          id: "u",
          type: "userMessage",
          content: [{ type: "text", text: "Edit the document" }],
        },
      }),
      event("item/started", {
        item: { id: "a", type: "agentMessage", text: "" },
      }),
      event("item/agentMessage/delta", {
        itemId: "a",
        delta: "I will read it.",
      }),
      event("item/completed", {
        item: { id: "a", type: "agentMessage", text: "I will read it." },
      }),
      event("item/started", {
        item: { id: "t", type: "commandExecution", command: "read document" },
      }),
      event("item/completed", {
        item: {
          id: "t",
          type: "commandExecution",
          command: "read document",
          aggregatedOutput: "content",
          status: "completed",
        },
      }),
      event("item/completed", {
        item: { id: "f", type: "agentMessage", text: "Done" },
      }),
      event("turn/completed", { turn: { id: "turn", items: [] } }),
    ];
    const entries = workTranscript(events);
    expect(entries.map((e) => e.kind)).toEqual([
      "instruction",
      "response",
      "tool",
      "response",
    ]);
    expect(entries[1].text).toBe("I will read it.");
    expect(entries[2]).toMatchObject({
      input: "read document",
      output: "content",
    });
  });
  it("does not misclassify responses mentioning tools or commands", () => {
    expect(
      workTranscript([
        event("item/completed", {
          item: {
            id: "a",
            type: "agentMessage",
            text: "The command and tool succeeded.",
          },
        }),
      ])[0].kind,
    ).toBe("response");
  });
  it("renders terminal errors but omits transient retry noise", () => {
    expect(
      workTranscript([
        event("error", { willRetry: true, error: { message: "retry" } }),
        event("error", { error: { message: "Failed" } }),
      ]).map((e) => e.text),
    ).toEqual(["Failed"]);
  });
});

it("shows bounded Session output text without its truncation envelope",()=>{
 const [tool]=workTranscript([event("item/completed",{item:{id:"session-call",type:"mcpToolCall",tool:"exec",result:{text:"actual output",truncated:true,originalChars:5000}}})]);
 expect(tool.output).toBe("actual output");
});
