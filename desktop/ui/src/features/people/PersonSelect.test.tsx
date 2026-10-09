// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {PersonSelect} from "./PersonSelect";
vi.mock("@/api/operation-runner",()=>({runOperation:async(_:string,fn:Function)=>fn({fetch:globalThis.fetch,fail:vi.fn()})}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const person={email:"employee@example.test",displayName:"Employee",username:"employee",avatarUrl:"https://example.test/photo.jpg",department:"Engineering",identity:{provider:"enterprise",subject:"employee"}};
it("selects verified identity with keyboard and resets after submission",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>[person]}));
 const view=render(<form><PersonSelect channelId="channel" enterprise excluded={[]}/></form>);
 const input=screen.getByRole("combobox") as HTMLInputElement;fireEvent.focus(input);fireEvent.change(input,{target:{value:"emp"}});
 await waitFor(()=>expect(screen.getByRole("option")).toBeTruthy());
 expect(screen.getByText("employee · Engineering")).toBeTruthy();expect(input.checkValidity()).toBe(false);
 fireEvent.keyDown(input,{key:"ArrowDown"});fireEvent.keyDown(input,{key:"Enter"});
 const form=view.container.querySelector("form")!;expect(new FormData(form).get("identity")).toBe(JSON.stringify(person.identity));expect(input.checkValidity()).toBe(true);
 fireEvent.reset(form);expect(new FormData(form).get("identity")).toBe("");
});
it("public mode preserves free email invitation",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>[]}));
 const view=render(<form><PersonSelect channelId="channel" enterprise={false} excluded={[]}/></form>);
 fireEvent.change(screen.getByRole("combobox"),{target:{value:"new@example.test"}});
 await waitFor(()=>expect(screen.getByRole("button",{name:"Invite new@example.test"})).toBeTruthy());
 const form=view.container.querySelector("form")!;expect(new FormData(form).get("email")).toBe("new@example.test");expect(new FormData(form).get("identity")).toBe("");
});
it("prevents duplicate selection and shows upstream failure",async()=>{
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[person]}).mockResolvedValueOnce({ok:false});vi.stubGlobal("fetch",fetch);
 render(<PersonSelect channelId="channel" enterprise excluded={[person.email]}/>);
 const input=screen.getByRole("combobox");fireEvent.focus(input);fireEvent.change(input,{target:{value:"emp"}});await waitFor(()=>expect(screen.getByRole("option").hasAttribute("disabled")).toBe(true));
 fireEvent.change(input,{target:{value:"other"}});await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("Could not search"));
});

it("does not request an empty search and clears a failed search when emptied", async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:false});vi.stubGlobal("fetch",fetch);
 render(<PersonSelect channelId="channel" enterprise excluded={[]}/>);
 const input=screen.getByRole("combobox");fireEvent.focus(input);
 await new Promise(resolve=>setTimeout(resolve,250));expect(fetch).not.toHaveBeenCalled();expect(screen.queryByRole("alert")).toBeNull();
 fireEvent.change(input,{target:{value:"emp"}});await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
 fireEvent.change(input,{target:{value:""}});expect(screen.queryByRole("alert")).toBeNull();expect(screen.getByText("Type a name or username to search.")).toBeTruthy();
 await new Promise(resolve=>setTimeout(resolve,250));expect(fetch).toHaveBeenCalledTimes(1);
});
