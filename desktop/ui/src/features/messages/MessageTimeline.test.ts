import { describe, expect, it } from "vitest";
import { mentionClass } from "./MessageTimeline";

describe("message mention appearance",()=>{
  it("highlights only a member mention addressed to the signed-in user",()=>{
    expect(mentionClass("member","me","me")).toContain("member-mention-me");
    expect(mentionClass("member","other","me")).not.toContain("member-mention-me");
    expect(mentionClass("agent","agent","me")).toContain("agent-mention");
  });
});
