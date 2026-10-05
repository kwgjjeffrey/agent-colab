// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { registry } from "./trace-operations";

const locator = readFileSync("../../observability/gui-locator/browser.js", "utf8");
beforeAll(() => window.eval(locator));
afterEach(() => { document.body.innerHTML=""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
test("global region locator works without Channel tabs", async () => {
 document.body.innerHTML='<aside data-trace-target="channels.list" data-trace-region="channels"></aside>';
 vi.spyOn(Element.prototype,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
 Element.prototype.scrollIntoView=vi.fn();
 const entry=registry.operations.find(o=>o.id==="channels.list")!;
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({json:async()=>[{...entry,surface:"gui",...entry.entry}]}));

 window.dispatchEvent(new MessageEvent("message",{origin:location.origin,source:window,data:{type:"trace.locate",id:entry.id}}));
 await vi.waitFor(()=>expect(document.querySelector('[data-trace-highlight="channels.list"]')).not.toBeNull());
});
test("settings navigation opens the popover and never executes update", async () => {
 document.body.innerHTML='<button data-trace-nav="settings">Settings</button>';
 vi.spyOn(Element.prototype,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
 Element.prototype.scrollIntoView=vi.fn();
 const execute=vi.fn();
 document.querySelector("button")!.onclick=()=>{const box=document.createElement("section");box.dataset.traceRegion="settings";box.innerHTML='<button data-trace-target="system.check-update system.update system.restart">Check updates</button>';box.querySelector("button")!.onclick=execute;document.body.append(box);};
 const entry=registry.operations.find(o=>o.id==="system.update")!;
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({json:async()=>[{...entry,surface:"gui",...entry.entry}]}));

 window.dispatchEvent(new MessageEvent("message",{origin:location.origin,source:window,data:{type:"trace.locate",id:entry.id}}));
 await vi.waitFor(()=>expect(document.querySelector('[data-trace-highlight="system.update"]')).not.toBeNull());
 expect(execute).not.toHaveBeenCalled();
});
test("missing resource reports only its region, never a located control", async () => {
 document.body.innerHTML='<section data-trace-region="files"></section>';
 vi.spyOn(Element.prototype,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
 Element.prototype.scrollIntoView=vi.fn();
 const report=vi.spyOn(window,"postMessage").mockImplementation(()=>{});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({json:async()=>[{id:"files.withdraw",surface:"gui",selector:'[data-trace-target="files.withdraw"]',locator:{kind:"control",region:"files",unavailable:"先选择自己的共享文件"}}]}));
 window.dispatchEvent(new MessageEvent("message",{origin:location.origin,source:window,data:{type:"trace.locate",id:"files.withdraw"}}));
 await vi.waitFor(()=>expect(report).toHaveBeenCalledWith(expect.objectContaining({ok:false,message:expect.stringContaining("具体控件尚不可用")}),location.origin),{timeout:4000});
});
test("locator refuses a navigation step on a business button", async () => {
 document.body.innerHTML='<button data-trace-target="system.update">Update</button>';
 vi.spyOn(Element.prototype,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
 const execute=vi.fn();document.querySelector("button")!.onclick=execute;
 const report=vi.spyOn(window,"postMessage").mockImplementation(()=>{});
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({json:async()=>[{id:"system.update",surface:"gui",locator:{steps:[{selector:'[data-trace-target="system.update"]'}]}}]}));
 window.dispatchEvent(new MessageEvent("message",{origin:location.origin,source:window,data:{type:"trace.locate",id:"system.update"}}));
 await vi.waitFor(()=>expect(report).toHaveBeenCalledWith(expect.objectContaining({ok:false,message:expect.stringContaining("拒绝点击")}),location.origin));
 expect(execute).not.toHaveBeenCalled();
});
