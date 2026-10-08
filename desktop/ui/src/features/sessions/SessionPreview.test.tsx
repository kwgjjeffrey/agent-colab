// @vitest-environment jsdom
import {cleanup,render,screen,fireEvent} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {SessionPreview} from "./SessionPreview";
import {catalogRequest} from "@/features/workspace/CatalogWorkspace";
vi.mock("@/features/workspace/CatalogWorkspace",()=>({catalogRequest:vi.fn(async()=>({turns:[{items:[{type:"userMessage",content:[{text:"Actual user question"}]},{type:"agentMessage",text:"Actual answer"}]}]}))}));
afterEach(cleanup);
it("reads selected Session and renders structured user content without a list or preview trigger",async()=>{
  render(<SessionPreview id="session"/>);
  expect(await screen.findByText("Actual user question")).toBeTruthy();
  expect(screen.getByText("Actual answer")).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Preview recent messages"})).toBeNull();
});
it("reads earlier pages using the server cursor and keeps the latest messages",async()=>{
  vi.mocked(catalogRequest).mockResolvedValueOnce({turns:[{items:[{type:"agentMessage",text:"Latest message"}]}],page:{hasMore:true,nextCursor:"opaque-cursor"}});
  vi.mocked(catalogRequest).mockResolvedValueOnce({turns:[{items:[{type:"userMessage",text:"Earlier message"}]}],page:{hasMore:false}});
  render(<SessionPreview id="paged"/>);
  await screen.findByText("Latest message");
  fireEvent.click(screen.getByRole("button",{name:"Load earlier messages"}));
  expect(await screen.findByText("Earlier message")).toBeTruthy();
  expect(screen.getByText("Latest message")).toBeTruthy();
  expect(catalogRequest).toHaveBeenLastCalledWith("/v1/sessions/paged/read","POST",expect.objectContaining({cursor:"opaque-cursor"}));
});
