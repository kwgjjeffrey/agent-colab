// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useGuiVersion } from "./useGuiVersion";
vi.mock("@/api/operation-runner", () => ({ runOperation: (_name: string, run: (scope: { fetch: typeof fetch }) => unknown) => run({ fetch }) }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
it("focus only reloads for changed GUI resources, and stale metadata cannot repeatedly reload", async () => {
  const reload = vi.fn();
  const request = vi.fn().mockImplementation(async () => Response.json({ version: "installed" }));
  vi.stubGlobal("fetch", request);
  renderHook(() => useGuiVersion("installed", reload));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(reload).not.toHaveBeenCalled();
  request.mockImplementation(async () => Response.json({ version: "updated" }));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(reload).toHaveBeenCalledTimes(1);
  cleanup();
  renderHook(() => useGuiVersion("installed", reload));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
  expect(reload).toHaveBeenCalledTimes(1);
});
it("focus bursts share one version check and connection failure retains the current page", async () => {
  let finish!: (value: Response) => void;
  const request = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", request);
  const reload = vi.fn();
  renderHook(() => useGuiVersion("installed", reload));
  act(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => finish(new Response("Unavailable", { status: 503 })));
  expect(reload).not.toHaveBeenCalled();
});
