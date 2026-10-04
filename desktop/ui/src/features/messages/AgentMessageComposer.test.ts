import {describe,expect,it} from "vitest";
import {serializeAgentDocument} from "./AgentMessageComposer";

describe("Agent message serialization",()=>{
  it("preserves middle mentions and routes every distinct UUID",()=>{
    const result=serializeAgentDocument({type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Please "},{type:"mention",attrs:{id:"e2045e37-1fab-445b-8ec0-82280b677c65",label:"Runtime Validation Agent"}},{type:"text",text:" reply exactly: received"}]}]});
    expect(result.plainText).toBe("Please @Runtime Validation Agent reply exactly: received");
    expect(result.mentions).toEqual([{blueprintId:"e2045e37-1fab-445b-8ec0-82280b677c65",label:"Runtime Validation Agent"}]);
  });
  it("keeps multiple Agents in text order and deduplicates routing identities",()=>{
    const result=serializeAgentDocument({type:"doc",content:[{type:"paragraph",content:[
      {type:"mention",attrs:{id:"11111111-1111-4111-8111-111111111111",label:"Release Agent"}},
      {type:"text",text:" compare with "},
      {type:"mention",attrs:{id:"22222222-2222-4222-8222-222222222222",label:"QA Agent"}},
      {type:"text",text:" then tell "},
      {type:"mention",attrs:{id:"11111111-1111-4111-8111-111111111111",label:"Release Agent"}},
      {type:"text",text:" the result"},
    ]}]});
    expect(result.plainText).toBe("@Release Agent compare with @QA Agent then tell @Release Agent the result");
    expect(result.mentions.map(item=>item.blueprintId)).toEqual(["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"]);
  });
  it("preserves a member capsule without adding it to Agent routing",()=>{
    const result=serializeAgentDocument({type:"doc",content:[{type:"paragraph",content:[
      {type:"text",text:"Thanks "},
      {type:"mention",attrs:{id:"member-42",label:"Ada",kind:"member"}},
      {type:"text",text:"; please review"},
    ]}]});
    expect(result.plainText).toBe("Thanks @Ada; please review");
    expect(result.mentions).toEqual([]);
    expect(result.content.content?.[0].content?.[1].attrs).toMatchObject({id:"member-42",kind:"member"});
  });
});
