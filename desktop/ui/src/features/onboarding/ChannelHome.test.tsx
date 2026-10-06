// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChannelHome, completeHomeTip } from "./ChannelHome";
afterEach(() => { cleanup(); localStorage.clear(); });
it("Try is not completion; explicit dismiss and real completion are account-scoped", async () => {
  const user = userEvent.setup(), tryCase = vi.fn();
  const props = { accountId: "a", onTry: tryCase, onNavigate: vi.fn() };
  const view = render(<ChannelHome {...props} />);
  await user.click(screen.getAllByRole("button", { name: "Try" })[0]);
  expect(tryCase).toHaveBeenCalledWith("switch-agent");
  expect(localStorage.getItem("colab:onboarding:a")).toBeNull();
  await user.click(screen.getByRole("button", { name: /Dismiss: Agent quota/ }));
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(2);
  completeHomeTip("a", "handoff-design");
  view.unmount();
  render(<ChannelHome {...props} />);
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(1);
  cleanup(); render(<ChannelHome {...props} accountId="b" />);
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(3);
});
it("long-ignored tips collapse but remain accessible", async () => {
  localStorage.setItem("colab:onboarding:a:visits", JSON.stringify(["2020-01-01", "2020-01-02", "2020-01-03"]));
  render(<ChannelHome accountId="a" onTry={vi.fn()} onNavigate={vi.fn()} />);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Try" })).toBeNull());
  await userEvent.click(screen.getByRole("button", { name: "View all use cases" }));
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(3);
});
