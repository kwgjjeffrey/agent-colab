// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
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
describe("Canvas identity HoverCard", () => {
  it("stays open from capsule into card and closes after leaving both", async () => {
    const user = userEvent.setup();
    const props = {
      node: { attrs: { id: "person", kind: "member", label: "Alice" } },
      getPos: () => 12,
    } as unknown as NodeViewProps;
    render(
      <CanvasMentionContext.Provider
        value={{
          canvasId: "doc",
          agents: [],
          participants: [],
          requests: [],
          send: vi.fn(),
          showWork: vi.fn(),
        }}
      >
        <CanvasMention {...props} />
      </CanvasMentionContext.Provider>,
    );
    const trigger = screen.getByText("@Alice");
    await user.hover(trigger);
    const content = await screen.findByText("Channel member");
    await user.hover(content);
    expect(screen.queryByText("Channel member")).not.toBeNull();
    await user.unhover(content);
    await waitFor(() =>
      expect(screen.queryByText("Channel member")).toBeNull(),
    );
    await user.hover(trigger);
    await screen.findByText("Channel member");
    await user.unhover(trigger);
    await waitFor(() =>
      expect(screen.queryByText("Channel member")).toBeNull(),
    );
  });
  it("opens on focus and closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <CanvasMention
        {...({
          node: { attrs: { id: "p", kind: "member", label: "Bob" } },
          getPos: () => 4,
        } as unknown as NodeViewProps)}
      />,
    );
    fireEvent.focus(screen.getByText("@Bob"));
    await screen.findByText("Channel member");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText("Channel member")).toBeNull(),
    );
  });
});
