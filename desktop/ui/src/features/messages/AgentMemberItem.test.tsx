// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentMemberItem } from "./AgentMemberItem";
import { taskTiming } from "@/features/agent/AgentIdentityCard";
import type { Blueprint, Participant, AgentRequestStatus } from "./types";
afterEach(cleanup);
const agent = { id: "a", name: "Researcher", ownerName: "Alice" } as Blueprint;
const owner = { memberId: "p", displayName: "Alice" } as Participant;
const tasks: AgentRequestStatus[] = [
  {
    id: "new",
    targetBlueprintId: "a",
    targetName: "Researcher",
    state: "running",
    summary: "Find examples",
    startedAt: "2026-10-04T02:00:00Z",
  },
  {
    id: "old",
    targetBlueprintId: "a",
    targetName: "Researcher",
    state: "succeeded",
    summary: "Read document",
    startedAt: "2026-10-04T01:00:00Z",
    finishedAt: "2026-10-04T01:02:10Z",
    durationMs: 130000,
  },
  {
    id: "other",
    targetBlueprintId: "b",
    targetName: "Other",
    state: "running",
  },
];
describe("Agent roster identity and tasks", () => {
  it("opens the selected task rather than the latest, and updates working state", async () => {
    const user = userEvent.setup(),
      showWork = vi.fn();
    const { rerender } = render(
      <AgentMemberItem
        agent={agent}
        owner={owner}
        requests={tasks}
        showWork={showWork}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: /Researcher.*Working… · 2 tasks/,
    });
    expect(trigger.className).toContain("agent-member-working");
    await user.click(trigger);
    expect(await screen.findByText("Alice's Agent")).not.toBeNull();
    expect(screen.queryByText("Agent owned by Alice")).toBeNull();
    expect(screen.getByText("2m 10s")).not.toBeNull();
    expect(screen.getAllByText(/^Started /)).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /Read document/ }));
    expect(showWork).toHaveBeenCalledWith(tasks[1]);
    await waitFor(() => expect(screen.queryByText("Alice's Agent")).toBeNull());
    rerender(
      <AgentMemberItem
        agent={agent}
        owner={owner}
        requests={tasks.map((task) => ({ ...task, state: "succeeded" }))}
        showWork={showWork}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Researcher.*2 tasks/ }).className,
    ).not.toContain("agent-member-working");
    expect(screen.queryByText(/Working…/)).toBeNull();
  });
  it("does not animate delivering commands and dismisses with Escape", async () => {
    const user = userEvent.setup();
    render(
      <AgentMemberItem
        agent={agent}
        owner={owner}
        requests={[{ ...tasks[0], state: "delivering" }]}
        showWork={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Researcher/ });
    expect(trigger.className).not.toContain("agent-member-working");
    await user.click(trigger);
    await screen.findByText("Alice's Agent");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Alice's Agent")).toBeNull());
  });
  it("formats actual duration and does not fabricate legacy timing", () => {
    expect(taskTiming(tasks[1], Date.now()).duration).toBe("2m 10s");
    expect(
      taskTiming(tasks[0], Date.parse("2026-10-04T02:00:45Z")).duration,
    ).toBe("45s");
    expect(
      taskTiming(
        { ...tasks[0], state: "succeeded", startedAt: undefined },
        Date.now(),
      ),
    ).toEqual({
      time: "Start time not recorded",
      duration: "Duration not recorded",
    });
  });
});
