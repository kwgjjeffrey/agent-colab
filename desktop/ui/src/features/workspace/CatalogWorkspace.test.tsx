// @vitest-environment jsdom
import "../../../tests/resize-observer";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogWorkspace } from "./CatalogWorkspace";
vi.mock("@/api/request-activity", () => ({
  trackedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));

describe("Catalog workspace", () => {
  it("places primary Add above Home and retains its item menu", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", {status:200})));
    render(<CatalogWorkspace channelId="channel" channelName="Team" view="home" onSelect={vi.fn()} onAdd={vi.fn()}>Home</CatalogWorkspace>);
    const add=screen.getByRole("button",{name:/^Add$/});
    const home=screen.getByRole("button",{name:/^Home$/});
    expect(add.classList.contains("bg-primary")).toBe(true);
    expect(add.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(add);
    expect(await screen.findByRole("menuitem",{name:/^Catalog$/})).toBeTruthy();
  });
  it("renames native Canvas through the existing name contract and cancels Escape without saving", async () => {
    const doc={id:"doc",kind:"canvas",name:"Plan",parentId:null,updatedAt:"today"};
    const fetcher=vi.fn(async (_path:string,init?:RequestInit)=>new Response(JSON.stringify(init?.method==="PATCH"?doc:[doc]),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    render(<CatalogWorkspace channelId="channel" channelName="Team" view="home" onSelect={vi.fn()} onAdd={vi.fn()}>Home</CatalogWorkspace>);
    fireEvent.doubleClick(await screen.findByRole("button",{name:"Plan"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Item name"}),{target:{value:"Renamed"}});
    fireEvent.keyDown(screen.getByRole("textbox",{name:"Item name"}),{key:"Enter"});
    await waitFor(()=>expect(fetcher).toHaveBeenCalledWith("/v1/canvases/doc",expect.objectContaining({method:"PATCH",body:JSON.stringify({name:"Renamed"})})));
    await waitFor(()=>expect(screen.queryByRole("textbox",{name:"Item name"})).toBeNull());
    const count=fetcher.mock.calls.filter(([,init])=>init?.method==="PATCH").length;
    fireEvent.doubleClick(screen.getByRole("button",{name:"Plan"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Item name"}),{target:{value:"Cancelled"}});
    fireEvent.keyDown(screen.getByRole("textbox",{name:"Item name"}),{key:"Escape"});
    expect(screen.queryByRole("textbox",{name:"Item name"})).toBeNull();
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==="PATCH")).toHaveLength(count);
  });
  it("returns a nested asset to its containing catalog", async () => {
    const parent = {id:"parent",kind:"catalog",name:"Design",parentId:null,updatedAt:"today"};
    const asset = {id:"asset",kind:"session",name:"Research",parentId:"parent",updatedAt:"today"};
    vi.stubGlobal("fetch", vi.fn(async (path:string) => new Response(JSON.stringify(path.endsWith("/trail") ? [parent,asset] : path.includes("parentId") ? [asset] : [parent]), {status:200,headers:{"content-type":"application/json"}})));
    const onSelect=vi.fn();
    render(<CatalogWorkspace channelId="channel" channelName="Team" view="sessions" focus={{id:"asset",kind:"session"}} onSelect={onSelect} onAdd={vi.fn()}>Session detail</CatalogWorkspace>);
    await screen.findByRole("link",{name:"Research"});
    expect(screen.queryByRole("button",{name:/Back/})).toBeNull();
    fireEvent.click(within(screen.getByRole("navigation",{name:"breadcrumb"})).getByRole("button",{name:"Design"}));
    expect(onSelect).toHaveBeenCalledWith(parent);
  });
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
    fireEvent.click(screen.getByRole("button",{name:"Home"}));
    expect(onSelect).toHaveBeenCalledWith("add");
    expect(screen.getByRole("button",{name:"Add"}).getAttribute("aria-haspopup")).toBe("menu");
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
