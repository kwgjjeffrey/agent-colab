// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilesView } from "./FilesView";
afterEach(cleanup);
it("opens configuration before choosing a source and keeps it open on chooser cancellation", async () => {
  const choose = vi.fn().mockResolvedValue(null), consumed = vi.fn();
  render(<FilesView creationParentRef="colab://channel/ch" shareOpenToken={1} onShareOpenConsumed={consumed} shares={[]} busy={false} onChoose={choose} onShare={vi.fn()} onEnsureLocal={vi.fn()} onWithdraw={vi.fn()} onRetry={vi.fn()} defaultAgent="codex" installedAgents={{}} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(choose).not.toHaveBeenCalled();
  expect(consumed).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", {name:"Give to Agent"})).toBeTruthy();
  await userEvent.click(screen.getByRole("button", {name:"Choose files"}));
  expect(choose).toHaveBeenCalledOnce();
  expect(screen.getByRole("dialog")).toBeTruthy();
});
