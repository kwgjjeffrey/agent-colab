// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NodeViewProps } from "@tiptap/react";
import { CanvasMention, CanvasMentionContext } from "./CanvasMention";
vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
afterEach(cleanup);
describe("Canvas identity click card", () => {
  it("highlights the current member mention like Messages", () => {
    render(<CanvasMentionContext.Provider value={{ canvasId: "doc", agents: [], participants: [{ memberId: "me", displayName: "Alice", email: "", isCurrent: true, agentCount: 0 }], requests: [], prepareSend: vi.fn(), showWork: vi.fn() }}><CanvasMention {...({ node: { attrs: { id: "me", kind: "member", label: "Alice" } }, getPos: () => 1 } as unknown as NodeViewProps)} /></CanvasMentionContext.Provider>);
    expect(screen.getByText("@Alice").className).toContain("member-mention-me");
  });
  it("ignores hover and opens on click until dismissed", async () => {
    const user = userEvent.setup();
    render(<CanvasMention {...({ node: { attrs: { id: "p", kind: "member", label: "Alice" } }, getPos: () => 4 } as unknown as NodeViewProps)} />);
    const trigger = screen.getByText("@Alice");
    await user.hover(trigger);
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(screen.queryByText("Channel member")).toBeNull();
    await user.click(trigger);
    await screen.findByText("Channel member");
    await user.unhover(trigger);
    expect(screen.queryByText("Channel member")).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Channel member")).toBeNull());
  });
  it("opens with keyboard activation and closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <CanvasMention
        {...({
          node: { attrs: { id: "p", kind: "member", label: "Bob" } },
          getPos: () => 4,
        } as unknown as NodeViewProps)}
      />,
    );
    screen.getByText("@Bob").focus();
    expect(screen.queryByText("Channel member")).toBeNull();
    await user.keyboard("{Enter}");
    await screen.findByText("Channel member");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText("Channel member")).toBeNull(),
    );
  });
});
