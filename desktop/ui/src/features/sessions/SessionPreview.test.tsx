// @vitest-environment jsdom
import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {SessionPreview} from "./SessionPreview";
vi.mock("@/features/workspace/CatalogWorkspace",()=>({catalogRequest:vi.fn(async()=>({turns:[{items:[{type:"userMessage",content:[{text:"Actual user question"}]},{type:"agentMessage",text:"Actual answer"}]}]}))}));
afterEach(cleanup);
it("reads selected Session and renders structured user content without a list or preview trigger",async()=>{
  render(<SessionPreview id="session"/>);
  expect(await screen.findByText("Actual user question")).toBeTruthy();
  expect(screen.getByText("Actual answer")).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Preview recent messages"})).toBeNull();
});
