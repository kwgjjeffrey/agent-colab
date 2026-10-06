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
  await userEvent.click(await screen.findByRole("button", { name: "Design" }));
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
