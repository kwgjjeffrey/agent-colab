// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MessageTimeline } from "./MessageTimeline";
afterEach(() => { cleanup(); sessionStorage.clear(); });
it("guidance is the first stream content and remains ahead of real messages as they arrive", async () => {
  const onAddAgent = vi.fn();
  const props = { channelId: "a", messages: [], agents: [], requests: [], selected: new Set<string>(), selectionMode: false, showWork: vi.fn(), onSelected: vi.fn(), onReply: vi.fn(), onForward: vi.fn(), onStartSelection: vi.fn(), onAddAgent };
  const view = render(<MessageTimeline {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Add my Agent" }));
  expect(onAddAgent).toHaveBeenCalledOnce();
  view.rerender(<MessageTimeline {...props} messages={[{ id: "m", channelId: "a", seq: 1, body: "Our first decision", content: {}, senderName: "Me", senderKind: "member", createdAt: "2026-10-08T00:00:00Z" }]} />);
  const tip = screen.getByText("Turn a decision into action");
  const message = screen.getByText("Our first decision");
  expect(tip.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(tip.closest(".overflow-y-auto")).toBe(message.closest(".overflow-y-auto"));
});
