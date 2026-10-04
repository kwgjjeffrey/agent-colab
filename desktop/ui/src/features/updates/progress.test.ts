import {describe,it,expect,vi} from "vitest";
import {isUpdateRunning,readUpdateProgress} from "./progress";
describe("updater authority",()=>{
 it("recovers a background operation without a local click",async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({state:"downloading",running:true,received:12,total:30})));
  expect(isUpdateRunning(await readUpdateProgress(fetcher))).toBe(true);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/v1/system/update-progress"),{cache:"no-store"});
 });
 it("lock overrides terminal transfer state and stale progress",()=>{
  expect(isUpdateRunning({state:"completed",running:true})).toBe(true);
  expect(isUpdateRunning({state:"downloading",running:false})).toBe(false);
 });
 it("supports old Core and propagates status fetch failure instead of idle",async()=>{
  expect(isUpdateRunning({state:"downloading"})).toBe(true);
  await expect(readUpdateProgress(vi.fn().mockResolvedValue(new Response(null,{status:500})))).rejects.toThrow("500");
 });
});
