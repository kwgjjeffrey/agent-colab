import { describe, expect, it } from "vitest";
import { activeAgentNames, agentActivityLabel } from "./agent-activity";

describe("Agent activity",()=>{
  it("shows only running Agents and deduplicates their name",()=>{
    expect(activeAgentNames([
      {id:"1",state:"running",targetName:"Release Agent"},
      {id:"2",state:"succeeded",targetName:"Research Agent"},
      {id:"3",state:"running",targetName:"Release Agent"},
    ])).toEqual(["Release Agent"]);
  });
  it("uses a compact title-bar label",()=>{
    expect(agentActivityLabel(["Release Agent"])).toBe("Release Agent is working…");
    expect(agentActivityLabel([])).toBe("");
  });
});
