// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChannelContextProvider, useChannelContext } from "./ChannelContext";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/features/messages/api", () => ({ messageRequest: request }));
vi.mock("@/api/realtime", () => ({
  accountRealtime: { subscribe: () => () => {} },
}));
vi.mock("./ForwardToAgentDialog", () => ({ ForwardToAgentDialog: () => null }));

function Consumer() {
  const context = useChannelContext();
  return <button onClick={() => void context?.refresh()}>Open resource choices</button>;
}

afterEach(() => {
  cleanup();
  request.mockReset();
});

it("loads only people on entry and waits for an explicit resource choice", async () => {
  request.mockImplementation(async (path: string) => {
    if (path.endsWith("/participants")) return [];
    return [];
  });
  render(<ChannelContextProvider channelId="channel" navigate={vi.fn()}><Consumer /></ChannelContextProvider>);
  await waitFor(() => expect(request).toHaveBeenCalledWith("/v1/channels/channel/participants", undefined, true));
  expect(request.mock.calls.some(([path]) => /\/(files|sessions|canvases|messages)(?:\?|$)/.test(path))).toBe(false);
  await userEvent.setup().click(screen.getByRole("button", { name: "Open resource choices" }));
  await waitFor(() => expect(request.mock.calls.some(([path]) => path.endsWith("/canvases"))).toBe(true));
  expect(request.mock.calls.some(([path]) => path.includes("/messages?"))).toBe(false);
});
