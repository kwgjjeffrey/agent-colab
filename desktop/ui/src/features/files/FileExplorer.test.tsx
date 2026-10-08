// @vitest-environment jsdom
import {render,screen,cleanup} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {FileExplorer} from "./FileExplorer";
vi.mock("./FilePreview",()=>({FilePreview:({path}:{path:string})=><div>{path}</div>}));
afterEach(cleanup);
it("a renamed single-file source previews directly without a second tree",()=>{
  render(<FileExplorer shareId="one" shareName="Different display name" sourceKind="file" entries={[{path:"image.png",name:"image.png",kind:"file",size:12}]} onClose={()=>{}}/>);
  expect(screen.queryByRole("tree")).toBeNull();
  expect(screen.getByText("image.png")).toBeTruthy();
});
it("a directory containing only one file still retains its file tree",()=>{
  render(<FileExplorer shareId="directory" shareName="image.png" sourceKind="directory" entries={[{path:"image.png",name:"image.png",kind:"file",size:12}]} onClose={()=>{}}/>);
  expect(screen.getByRole("tree")).toBeTruthy();
});
