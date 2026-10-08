// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SessionsView } from "./SessionsView";
vi.mock("@/api/operation-runner", () => ({ runOperation: (_name: string, fn: (scope: object) => unknown) => fn({ fetch, prompt: vi.fn(), fail: vi.fn() }) }));
const props = { channelId: "a", channelName: "Team", shares: [{ id: "s", channelId: "a", name: "Login investigation", sourceAdapter: "codex-jsonl-v1", contributorName: "Teammate", currentSnapshotId: "snapshot", canWithdraw: false, updatedAt: "2026-10-08T00:00:00Z" }], busy: false, defaultAgent: "codex" as const, installedAgents: {}, onRefresh: vi.fn(), onWithdraw: vi.fn() };
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
it("guidance is only present while the Session list is empty", () => {
  const view = render(<SessionsView {...props} shares={[]} />);
  expect(screen.getByText("Let another Agent pick up the work")).toBeTruthy();
  expect(screen.getByText("Review a decision or summarize progress")).toBeTruthy();
  view.rerender(<SessionsView {...props} />);
  expect(screen.queryByText("Share the work behind your answer")).toBeNull();
  expect(screen.queryByText("Let another Agent pick up the work")).toBeNull();
  expect(screen.queryByText("Review a decision or summarize progress")).toBeNull();
  expect(screen.getByText("Login investigation")).toBeTruthy();
  view.rerender(<SessionsView {...props} shares={[]} />);
  expect(screen.getByText("Review a decision or summarize progress")).toBeTruthy();
});
it("empty-state Try opens the real session chooser without recording completion", async () => {
  const user = userEvent.setup();
  render(<SessionsView {...props} shares={[]} />);
  await user.click(screen.getAllByRole("button", { name: "Try" })[2]);
  expect(await screen.findByRole("dialog", { name: "Choose a shared session" })).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(localStorage.getItem("colab:sessions-tips:a")).toBeNull();
  expect(screen.getByText("Review a decision or summarize progress")).toBeTruthy();
});
