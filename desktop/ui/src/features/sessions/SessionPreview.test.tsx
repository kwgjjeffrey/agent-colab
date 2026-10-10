// @vitest-environment jsdom
import "../../../tests/resize-observer";
import {cleanup,render,screen,fireEvent} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {SessionPreview} from "./SessionPreview";
import {catalogRequest} from "@/features/workspace/CatalogWorkspace";
vi.mock("@/features/workspace/CatalogWorkspace",()=>({catalogRequest:vi.fn(async()=>({turns:[{items:[{type:"userMessage",content:[{text:"Actual user question"}]},{type:"agentMessage",text:"Actual answer"}]}]}))}));
vi.mock("@/api/operation-runner",()=>({runOperation:(_id:string,fn:(scope:unknown)=>unknown)=>fn({fail:vi.fn()})}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows failed synchronization independently of a readable local conversation",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({state:"failed",contributor:true,uploadedBytes:8388608,totalBytes:16777216}),{status:200})));
  render(<SessionPreview id="local-preview"/>);
  expect(await screen.findByText("Actual user question")).toBeTruthy();
  expect(await screen.findByText(/Sync failed — local preview is still available/)).toBeTruthy();
  expect(screen.getByText(/8.0 \/ 16.0 MiB uploaded/)).toBeTruthy();
  expect(catalogRequest).toHaveBeenCalledWith("/v1/sessions/local-preview/read","POST",expect.any(Object),expect.any(Object));
});
it("keeps tool content collapsed while showing conversation messages",async()=>{
  vi.mocked(catalogRequest).mockResolvedValueOnce({turns:[{items:[{type:"commandExecution",text:"Tool output detail"},{type:"agentMessage",text:"Visible response"}]}]});
  render(<SessionPreview id="tools"/>);
  await screen.findByText("Visible response");
  expect(screen.getByRole("button",{name:/Run command/}).getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("Tool output detail")).toBeNull();
});
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
  expect(catalogRequest).toHaveBeenLastCalledWith("/v1/sessions/paged/read","POST",expect.objectContaining({cursor:"opaque-cursor"}),expect.any(Object));
});

it("expands bounded execution input and output in the shared work-details card",async()=>{
 vi.mocked(catalogRequest).mockResolvedValueOnce({turns:[{items:[{id:"call",type:"commandExecution",command:"pwd",aggregatedOutput:"/workspace",status:"completed"},{type:"agentMessage",text:"Finished task"}]}]});
 render(<SessionPreview id="execution-card"/>); await screen.findByText("Finished task");
 const trigger=screen.getByRole("button",{name:/Run command completed/});expect(trigger.getAttribute("aria-expanded")).toBe("false");
 fireEvent.click(trigger);expect(await screen.findByText("pwd")).toBeTruthy();expect(screen.getByText("/workspace")).toBeTruthy();
 expect(catalogRequest).toHaveBeenLastCalledWith("/v1/sessions/execution-card/read","POST",expect.objectContaining({turnLimit:5,includeOutputs:true,maxOutputCharsPerItem:2000}),expect.any(Object));
});

it("groups adjacent executions without merging across an Agent response", async () => {
 vi.mocked(catalogRequest).mockResolvedValueOnce({turns:[{items:[
  {id:"a",type:"commandExecution",command:"first"},
  {id:"b",type:"commandExecution",command:"second"},
  {type:"agentMessage",text:"Message boundary"},
  {id:"c",type:"commandExecution",command:"third"},
  {id:"d",type:"commandExecution",command:"fourth"},
 ]}]});
 render(<SessionPreview id="groups"/>);await screen.findByText("Message boundary");
 const groups=screen.getAllByRole("button",{name:"2 tool calls"});expect(groups).toHaveLength(2);
 expect(screen.queryByRole("button",{name:/Run command/})).toBeNull();
 fireEvent.click(groups[0]);expect(screen.getAllByRole("button",{name:/Run command/})).toHaveLength(2);
 fireEvent.click(screen.getAllByRole("button",{name:/Run command/})[0]);expect(screen.getByText("first")).toBeTruthy();
 expect(screen.queryByText("third")).toBeNull();
});
