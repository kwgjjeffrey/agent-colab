import { afterEach, describe, expect, it, vi } from "vitest";
import { messageRequest } from "./api";

afterEach(()=>vi.unstubAllGlobals());
describe("messageRequest",()=>{
  it("accepts a successful empty mutation response",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(null,{status:204})));
    await expect(messageRequest("/selection",{method:"PATCH"})).resolves.toBeUndefined();
  });
  it("parses a JSON response exactly once",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response('{"id":"agent-1"}',{status:201,headers:{"content-type":"application/json"}})));
    await expect(messageRequest<{id:string}>("/agents",{method:"POST"})).resolves.toEqual({id:"agent-1"});
  });
});
