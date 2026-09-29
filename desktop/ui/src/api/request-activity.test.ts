import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestActivitySnapshot,
  subscribeRequestActivity,
  trackedFetch,
} from "./request-activity";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request activity", () => {
  it("tracks concurrent foreground requests until the final request settles", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => resolvers.push(resolve))));
    const snapshots: number[] = [];
    const unsubscribe = subscribeRequestActivity(() => snapshots.push(requestActivitySnapshot()));

    const first = trackedFetch("/first");
    const second = trackedFetch("/second");
    expect(requestActivitySnapshot()).toBe(2);

    resolvers[0](new Response());
    await first;
    expect(requestActivitySnapshot()).toBe(1);

    resolvers[1](new Response());
    await second;
    expect(requestActivitySnapshot()).toBe(0);
    expect(snapshots).toEqual([1, 2, 1, 0]);
    unsubscribe();
  });
});
