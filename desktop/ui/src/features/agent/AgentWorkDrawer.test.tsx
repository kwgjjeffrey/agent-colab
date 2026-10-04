// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentWorkDrawer } from "./AgentWorkDrawer";
vi.mock("@/features/messages/api", () => ({
  messageRequest: vi.fn(async () => ({
    requestId: "task",
    state: "succeeded",
    targetName: "Agent",
    events: [
      {
        method: "mcpServer/startupStatus/updated",
        params: { name: "protocol-noise" },
      },
      {
        method: "item/completed",
        params: {
          item: {
            id: "u",
            type: "userMessage",
            content: [{ text: "Please edit this document." }],
          },
        },
      },
      {
        method: "item/completed",
        params: {
          item: {
            id: "a",
            type: "agentMessage",
            text: "I will read the document.",
          },
        },
      },
      {
        method: "item/completed",
        params: {
          item: {
            id: "t",
            type: "commandExecution",
            command: "read document",
            aggregatedOutput: "Hidden tool output",
            status: "completed",
          },
        },
      },
      {
        method: "item/completed",
        params: {
          item: { id: "f", type: "agentMessage", text: "Document updated." },
        },
      },
    ],
  })),
}));
afterEach(cleanup);
it("renders conversation text, hides protocol noise, and collapses tool inputs/outputs by default", async () => {
  render(
    <AgentWorkDrawer
      open
      request={{ id: "task", state: "succeeded", targetName: "Agent" }}
      onOpenChange={vi.fn()}
    />,
  );
  await screen.findByText("Document updated.");
  expect(screen.getByText("Please edit this document.")).toBeTruthy();
  expect(screen.getByText("I will read the document.")).toBeTruthy();
  expect(screen.queryByText("protocol-noise")).toBeNull();
  expect(screen.queryByText("Hidden tool output")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Run command/ }));
  expect(await screen.findByText("Hidden tool output")).toBeTruthy();
  expect(screen.getByText("read document")).toBeTruthy();
});
