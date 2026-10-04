import {describe,expect,it} from "vitest";
import {mergeAgentRequest,mergeAgentRequestLists,type AgentRequestStatus} from "./agent-request-state";
const request=(state:AgentRequestStatus["state"]):AgentRequestStatus=>({id:"request-1",state,prompt:"prompt"});

describe("agent request status projection",()=>{
  it("does not let a late create response regress running to queued",()=>expect(mergeAgentRequest(request("running"),request("queued")).state).toBe("running"));
  it("does not let an older list response erase completion",()=>expect(mergeAgentRequestLists([request("succeeded")],[request("running")])[0]?.state).toBe("succeeded"));
  it("accepts forward progress",()=>expect(mergeAgentRequest(request("queued"),request("running")).state).toBe("running"));
});
