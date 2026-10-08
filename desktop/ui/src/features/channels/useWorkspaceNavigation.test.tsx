// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";
afterEach(() => { cleanup(); localStorage.clear(); });
it("restores each Channel's tab on switching and after a cold renderer restart", () => {
  const view = renderHook(useWorkspaceNavigation);
  act(() => { view.result.current.setSelectedId("a"); view.result.current.setWorkspaceTab("canvas"); });
  act(() => view.result.current.setSelectedId("b"));
  expect(view.result.current.workspaceTab).toBe("home");
  act(() => view.result.current.setWorkspaceTab("sessions"));
  act(() => view.result.current.setSelectedId("a"));
  expect(view.result.current.workspaceTab).toBe("canvas");
  view.unmount();
  const restored = renderHook(useWorkspaceNavigation);
  expect(restored.result.current.selectedId).toBe("a");
  expect(restored.result.current.workspaceTab).toBe("canvas");
  act(() => restored.result.current.setSelectedId(current => current === "a" ? "b" : undefined));
  expect(restored.result.current.workspaceTab).toBe("sessions");
});
it("logout removes the last Channel and invalid saved tabs fall back safely", () => {
  localStorage.setItem("colab:last-channel", "a"); localStorage.setItem("colab:channel-tab:a", "invalid");
  const view = renderHook(useWorkspaceNavigation);
  expect(view.result.current.workspaceTab).toBe("home");
  act(() => view.result.current.setSelectedId(undefined));
  expect(localStorage.getItem("colab:last-channel")).toBeNull();
});
