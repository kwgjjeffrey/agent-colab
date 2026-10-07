// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentActivity } from "./RecentActivity";
const { request, navigate } = vi.hoisted(() => ({
  request: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/features/messages/api", () => ({ messageRequest: request }));
vi.mock("@/features/context/ChannelContext", () => ({
  useChannelContext: () => ({ channelId: "channel", navigate }),
}));
vi.mock("@/features/context/MentionCapsule", () => ({
  MentionCapsule: ({ id, label }: { id: string; label: string }) => (
    <button data-object-id={id} onClick={() => {}}>
      {label}
    </button>
  ),
}));
vi.mock("@/features/agent/AgentWorkDrawer", () => ({
  AgentWorkDrawer: ({
    request,
    open,
  }: {
    request?: { id: string };
    open: boolean;
  }) => (open ? <div role="dialog">Task {request?.id}</div> : null),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("fetches one bounded page and locates the clicked shared object", async () => {
  request
    .mockResolvedValueOnce({
      items: [
        {
          id: "share:1",
          action: "shared",
          actorName: "Alice",
          resourceKind: "session",
          resourceId: "1",
          resourceName: "Design",
          occurredAt: "2026-10-06T10:00:00Z",
        },
      ],
      nextCursor: { before: "2026-10-06T10:00:00Z", beforeId: "share:1" },
    })
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  render(<RecentActivity />);
  await userEvent.click(
    await screen.findByRole("link", { name: "Alice shared Design" }),
  );
  expect(navigate).toHaveBeenCalledWith({
    id: "1",
    kind: "session",
    name: "Design",
    channelId: "channel",
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe(
    "/v1/channels/channel/activity?limit=20",
  );
  await userEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][0]).toContain("beforeId=share%3A1");
});
it("a failed request is a visible retry, not an empty success", async () => {
  request
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  render(<RecentActivity />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("No activity yet.")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No activity yet.")).toBeTruthy();
});
it.each(["Messages", "Canvas"])(
  "%s activity opens its exact task, not the message or newest task",
  async (source) => {
    request.mockResolvedValueOnce({
      items: [
        {
          id: "request:exact-task",
          action: "requested",
          actorName: "Alice",
          resourceKind: "message",
          resourceId: "trigger-message",
          resourceName: "Check build",
          occurredAt: "2026-10-06T10:00:00Z",
          targetName: "Builder",
          source,
          state: "succeeded",
        },
      ],
      nextCursor: null,
    });
    render(<RecentActivity />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(
      await screen.findByRole("link", { name: "Alice requested Check build" }),
    );
    expect(screen.getByRole("dialog").textContent).toBe("Task exact-task");
    expect(navigate).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  },
);
it("object capsules retain their stable identities without opening the activity", async () => {
  request.mockResolvedValueOnce({
    items: [
      {
        id: "request:task",
        action: "requested",
        actorName: "Alice",
        actorMemberId: "member-id",
        resourceKind: "message",
        resourceId: "message",
        resourceName: "Check build",
        occurredAt: "2026-10-06T10:00:00Z",
        targetName: "Builder",
        targetBlueprintId: "blueprint-id",
        source: "Messages",
        state: "succeeded",
        previewContent: {
          content: [
            {
              type: "mention",
              attrs: { kind: "files", id: "file-id", label: "Plan" },
            },
          ],
        },
      },
    ],
    nextCursor: null,
  });
  render(<RecentActivity />);
  const target = await screen.findByRole("button", { name: "Builder" });
  expect(target.getAttribute("data-object-id")).toBe("blueprint-id");
  await userEvent.click(target);
  await userEvent.click(screen.getByRole("button", { name: "Plan" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(navigate).not.toHaveBeenCalled();
  const row = screen.getByRole("link", { name: "Alice requested Check build" });
  row.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("dialog").textContent).toBe("Task task");
});
