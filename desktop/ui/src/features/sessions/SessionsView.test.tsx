// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SessionsView } from "./SessionsView";
vi.mock("@/api/operation-runner", () => ({ runOperation: (_name: string, fn: (scope: object) => unknown) => fn({ fetch, prompt: vi.fn(), fail: vi.fn() }) }));
const props = { channelId: "a", channelName: "Team", shares: [{ id: "s", channelId: "a", name: "Login investigation", sourceAdapter: "codex-jsonl-v1", contributorName: "Teammate", currentSnapshotId: "snapshot", canWithdraw: false, updatedAt: "2026-10-08T00:00:00Z" }], busy: false, defaultAgent: "codex" as const, installedAgents: {}, onRefresh: vi.fn(), onWithdraw: vi.fn() };
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
it("review onboarding chooses real Session metadata, uses the reader prompt and completes only after copying", async () => {
  const user = userEvent.setup();
  const view = render(<SessionsView {...props} />);
  await user.click(screen.getAllByRole("button", { name: "Try" })[2]);
  await user.click(await screen.findByRole("button", { name: /Login investigation · Teammate/ }));
  expect(screen.getByText(/Review the decisions in this session, summarize progress/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Copy prompt" }));
  await waitFor(() => expect(screen.queryByText("Review a decision or summarize progress")).toBeNull());
  expect(screen.getByText("Let another Agent pick up the work")).toBeTruthy();
  view.unmount();
  render(<SessionsView {...props} />);
  expect(screen.queryByText("Review a decision or summarize progress")).toBeNull();
});
it("closing a prompt is not completion and a different Channel keeps its own guidance", async () => {
  const user = userEvent.setup();
  render(<SessionsView {...props} />);
  await user.click(screen.getAllByRole("button", { name: "Try" })[1]);
  await user.click(await screen.findByRole("button", { name: /Login investigation · Teammate/ }));
  await user.keyboard("{Escape}");
  expect(localStorage.getItem("colab:sessions-tips:a")).toBeNull();
  expect(screen.getByText("Let another Agent pick up the work")).toBeTruthy();
});
