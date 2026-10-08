// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogWorkspace } from "./CatalogWorkspace";
vi.mock("@/api/request-activity", () => ({
  trackedFetch: (...args: unknown[]) =>
    fetch(...(args as Parameters<typeof fetch>)),
}));

describe("Catalog workspace", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (path: string) =>
          new Response(
            JSON.stringify(
              path.includes("parentId")
                ? []
                : [
                    {
                      id: "folder",
                      kind: "catalog",
                      name: "Design",
                      parentId: null,
                      updatedAt: "today",
                    },
                    {
                      id: "session",
                      kind: "session",
                      name: "Investigation",
                      parentId: null,
                      updatedAt: "today",
                    },
                  ],
            ),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
  });
  it("exposes Add and Message alongside mixed assets, without tabs", async () => {
    const onSelect = vi.fn();
    render(
      <CatalogWorkspace
        channelId="channel"
        channelName="Team"
        view="home"
        onSelect={onSelect}
        onAdd={vi.fn()}
      >
        Actual Add content
      </CatalogWorkspace>,
    );
    await screen.findByRole("button", { name: "Investigation" });
    expect(screen.queryAllByRole("tab").length).toBe(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Message" }),
    );
    expect(onSelect).toHaveBeenCalledWith("message");
    fireEvent.click(screen.getByRole("button", { name: "Investigation" }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session", kind: "session" }),
    );
  });
  it("expansion loads only direct children", async () => {
    render(
      <CatalogWorkspace
        channelId="channel"
        channelName="Team"
        view="home"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      >
        Add
      </CatalogWorkspace>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Expand Design" }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("parentId=folder"),
        expect.anything(),
      ),
    );
  });
  it("root creation uses a real name Dialog and mutation", async () => {
    render(
      <CatalogWorkspace
        channelId="channel"
        channelName="Team"
        view="home"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      >
        Add
      </CatalogWorkspace>,
    );
    act(() =>
      window.dispatchEvent(
        new CustomEvent("colab:catalog-add", { detail: { kind: "catalog" } }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Design notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/v1/channels/channel/catalogs",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Design notes" }),
        }),
      ),
    );
  });
});
