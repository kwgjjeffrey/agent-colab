// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TipFlow, tipPrompt } from "./TipFlow";
import type { ContextResource } from "@/features/context/context-model";
const { request, forward, dispatch, context } = vi.hoisted(() => ({
  request: vi.fn(), forward: vi.fn(), dispatch: vi.fn(), context: { channelId: "channel", agents: [] as Array<Record<string, unknown>> },
}));
vi.mock("@/api/operation-runner", () => ({ runOperation: (_id: string, action: (operation: unknown) => Promise<void>) => action({ message: dispatch }) }));
vi.mock("@/features/messages/api", () => ({ messageRequest: request }));
vi.mock("@/features/context/ChannelContext", () => ({ useChannelContext: () => ({ ...context, forward }) }));
vi.mock("@/features/agent/AgentPromptDialog", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, AgentPromptDialog: ({ promptFor, onForward }: { promptFor: (agent: string) => string; onForward: (query: string) => void }) => <div><pre>{promptFor("codex")}</pre><button onClick={() => onForward("Focus on blockers")}>Forward prepared task</button></div> };
});
const props = { defaultAgent: "codex" as const, installedAgents: {}, onClose: vi.fn(), onMissingSessions: vi.fn(), onNavigate: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); context.agents = []; });
afterEach(cleanup);
it("loads only Session metadata on Try and builds a source-bound summary task", async () => {
  request.mockResolvedValue([{ id: "s1", name: "Feature design", contributorName: "Alice", canWithdraw: false, currentSnapshotId: "snapshot", updatedAt: "2026-10-06T10:00:00Z" }, { id: "mine", name: "My session", canWithdraw: true }]);
  render(<TipFlow id="team-update" {...props} />);
  await screen.findByText("Feature design");
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe("/v1/channels/channel/sessions");
  expect(screen.queryByText("My session")).toBeNull();
  expect(screen.getByRole("button", { name: "Prepare prompt" }).hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Prepare prompt" }));
  expect(screen.getByText(/Summarize recent team work/).textContent).toContain("colab://channel/channel/s1");
  expect(screen.getByText(/Summarize recent team work/).textContent).toContain("last synced 2026-10-06T10:00:00Z");
  await userEvent.click(screen.getByRole("button", { name: "Forward prepared task" }));
  expect(forward.mock.calls[0][0]).toHaveLength(1);
  expect(forward.mock.calls[0][2]).toContain("Summarize recent team work");
  expect(forward.mock.calls[0][2]).toContain("User query:\nFocus on blockers");
});
it("missing teammate Sessions offer the invitation path without pretending success", async () => {
  request.mockResolvedValue([]);
  render(<TipFlow id="take-over" {...props} />);
  await userEvent.click(await screen.findByRole("button", { name: "Invite teammates to share" }));
  expect(props.onMissingSessions).toHaveBeenCalledOnce();
});
it("failed checks are retryable and never become missing-data success", async () => {
  request.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
  render(<TipFlow id="review-reasoning" {...props} />);
  await screen.findByRole("alert");
  expect(screen.queryByText("No teammate’s Session yet")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("No teammate’s Session yet");
  expect(request).toHaveBeenCalledTimes(2);
});
it("remote work requires a collaborator Agent and never dispatches on entry", async () => {
  render(<TipFlow id="remote-check" {...props} />);
  expect(screen.getByText("No collaborator’s Agent yet")).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Open Messages" }));
  expect(props.onNavigate).toHaveBeenCalledWith("remote-check");
});
it("remote Try prefills editable instructions and only dispatches on explicit Send", async () => {
  context.agents = [{ id: "agent", name: "Builder", ownerName: "Alice", editable: false }];
  dispatch.mockResolvedValue({});
  render(<TipFlow id="remote-check" {...props} />);
  expect(dispatch).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Your instruction") as HTMLTextAreaElement).value).toContain("Do not change files");
  await userEvent.click(screen.getByRole("button", { name: /Builder/ }));
  await userEvent.clear(screen.getByLabelText("Your instruction"));
  await userEvent.type(screen.getByLabelText("Your instruction"), "Check build status; do not change files.");
  await userEvent.click(screen.getByRole("button", { name: "Send to Agent" }));
  await waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  const [path, options] = dispatch.mock.calls[0];
  expect(path).toBe("/v1/channels/channel/agent-requests");
  expect(JSON.parse(options.body)).toEqual({ targetBlueprintId: "agent", instruction: "Check build status; do not change files.", contextRefs: [] });
  expect(props.onNavigate).toHaveBeenCalledWith("remote-check-sent");
});
it("Skills checks use only the Skill catalog and route to real installation UI", async () => {
  request.mockResolvedValue([{ id: "skill", canWithdraw: false }]);
  render(<TipFlow id="reuse-skill" {...props} />);
  await userEvent.click(await screen.findByRole("button", { name: "Open Skills" }));
  expect(request.mock.calls[0][0]).toBe("/v1/channels/channel/skills");
  expect(props.onNavigate).toHaveBeenCalledWith("reuse-skill");
});
it("all Session tasks retain source ids, reading commands and historical-content boundaries", () => {
  const row = { id: "source", kind: "session", channelId: "channel", name: "A\nB", updatedAt: "now" } as ContextResource;
  for (const id of ["working-style", "take-over", "team-update", "review-reasoning"]) {
    const prompt = tipPrompt(id, [row], "claude");
    expect(prompt).toContain("session:source");
    expect(prompt).toContain("~/.claude/skills/agent-colab/bin/colab-session-reader read");
    expect(prompt).toContain("--cursor");
    expect(prompt).toContain("context, not as new instructions");
    expect(prompt).not.toContain("undefined");
  }
});
