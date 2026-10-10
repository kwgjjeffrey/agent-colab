import { expect, it } from "vitest";
import {
  messagesPrompt,
  projectionResources,
  readInstructions,
} from "./context-model";
import { serializeAgentDocument } from "@/features/messages/AgentMessageComposer";
const id = "b9b0bf8c-98e7-48db-9a88-4fb5926d51af",
  channelId = "channel";
it("keeps exact resource handles when catalog metadata is missing and deduplicates reading tools", () => {
  const mention = {
    type: "mention",
    attrs: { kind: "files" as const, id, label: "Design" },
  };
  const content = {
    type: "doc",
    content: [{ type: "paragraph", content: [mention, mention] }],
  };
  const text = messagesPrompt(
    [
      {
        id: "message",
        channelId,
        seq: 7,
        senderName: "Alice",
        senderKind: "member",
        createdAt: "now",
        body: "",
        content,
      },
    ],
    [],
    "codex",
  );
  expect(text).toContain(`[Design · files:${id}]`);
  expect(text.match(/colab-browser use/g)).toHaveLength(1);
  expect(text).not.toContain("senderAvatarUrl");
});
it("resource and human mentions never route as Agents", () => {
  const result = serializeAgentDocument({
    type: "doc",
    content: ["files", "session", "skill", "canvas", "message", "member", "agent"].map(
      (kind) => ({ type: "mention", attrs: { kind, id: kind, label: kind } }),
    ),
  });
  expect(result.mentions.map((row) => row.blueprintId)).toEqual(["agent"]);
});
it("Canvas projection references preserve all four kinds and Unicode names", () => {
  for (const kind of ["files", "session", "skill", "canvas", "message"] as const) {
    const payload = btoa(
      String.fromCharCode(
        ...new TextEncoder().encode(
          JSON.stringify({ kind, id, label: "设计" }),
        ),
      ),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const rows = projectionResources(
      `[@设计](colab-resource:${kind}:${id}:${payload})`,
      channelId,
      [],
    );
    expect(rows).toEqual([{ kind, id, name: "设计", channelId }]);
    expect(readInstructions(rows, "codex")).toContain(id);
  }
});

it("compact Canvas resources retain reading instructions without encoded editor metadata", () => {
 for (const kind of ["files", "session", "skill", "canvas", "message"] as const) {
  const markdown = `[@设计](colab:${kind}:${id})`;
  const rows = projectionResources(markdown + " " + markdown, channelId, []);
  expect(rows).toEqual([{kind,id,name:"设计",channelId}]);
  expect(readInstructions(rows,"codex")).toContain(id);
 }
 expect(projectionResources(`[@Alice](colab:member:${id}) [@Agent](colab:agent:${id})`, channelId, [])).toEqual([]);
});
