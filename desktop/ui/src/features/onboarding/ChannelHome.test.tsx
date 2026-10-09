// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChannelHome, completeHomeTip, homeTips } from "./ChannelHome";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
);
it("Try is not completion; explicit dismiss and real completion are account-scoped", async () => {
  const user = userEvent.setup(),
    tryCase = vi.fn();
  const props = { accountId: "a", onTry: tryCase };
  const view = render(<ChannelHome {...props} />);
  await user.click(screen.getAllByRole("button", { name: "Try" })[0]);
  expect(tryCase).toHaveBeenCalledWith("switch-agent");
  expect(localStorage.getItem("colab:onboarding:a")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: /Dismiss: Agent quota/ }),
  );
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(homeTips.length - 1);
  completeHomeTip("a", "handoff-design");
  view.unmount();
  render(<ChannelHome {...props} />);
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(homeTips.length - 2);
  cleanup();
  render(<ChannelHome {...props} accountId="b" />);
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(homeTips.length);
});
it("the whole Tips section can be collapsed and stays collapsed after reopening", async () => {
  const props = { accountId: "collapse", onTry: vi.fn() };
  const view = render(<ChannelHome {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Use cases" }));
  expect(screen.queryByRole("button", { name: "Try" })).toBeNull();
  view.unmount();
  render(<ChannelHome {...props} />);
  expect(screen.queryByRole("button", { name: "Try" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Use cases" }));
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(homeTips.length);
  expect(screen.queryByText("Your collaboration workspace")).toBeNull();
  expect(screen.queryByRole("region", { name: "Recent activity" })).toBeNull();
});
it("long-ignored tips collapse but remain accessible", async () => {
  localStorage.setItem(
    "colab:onboarding:a:visits",
    JSON.stringify(["2020-01-01", "2020-01-02", "2020-01-03"]),
  );
  render(<ChannelHome accountId="a" onTry={vi.fn()} />);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Try" })).toBeNull(),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "View all use cases" }),
  );
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(homeTips.length);
});
it("role filters make the relevant use cases identifiable without changing account identity", async () => {
  render(<ChannelHome accountId="roles" onTry={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Reviewer" }));
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(1);
  expect(screen.getByText(/Review the reasoning behind/)).toBeTruthy();
  expect(screen.queryByText(/Agent quota exhausted/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "All roles" }));
  expect(screen.getAllByRole("button", { name: "Try" })).toHaveLength(homeTips.length);
});
