// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { shareSetupPrompt, shellQuote } from "./ShareSetupPrompt";
describe("sharing setup prompt",()=>{
  it("preserves exact Catalog, source and exclusions",()=>{
    const prompt=shareSetupPrompt("codex",{kind:"files",parentRef:"colab://resource/ch/catalog/cat",sourcePath:"/tmp/user's files",excludes:["dist"]});
    expect(prompt).toContain("inspect-source --source '/tmp/user'\"'\"'s files' --exclude 'dist'");
    expect(prompt).toContain("share --parent 'colab://resource/ch/catalog/cat' --item-type files");
    expect(prompt).toContain("not arbitrary globs");
  });
  it("configures an existing share without creating another",()=>{
    const prompt=shareSetupPrompt("codex",{kind:"files",parentRef:"colab://channel/ch",sourcePath:"/tmp/docs",existingRef:"colab://channel/ch/item",excludes:[]});
    expect(prompt).toContain("sync-scope --ref 'colab://channel/ch/item' --set");
    expect(prompt).not.toContain(" --item-type files");
  });
  it("discovers one Skill and shares to the selected directory",()=>{
    const prompt=shareSetupPrompt("claude",{kind:"skill",parentRef:"colab://channel/Team"});
    expect(prompt).toContain("~/.claude/skills/agent-colab/bin/colab-skill-tool sources");
    expect(prompt).toContain("--item-type skill --source '<absolute-source-path>'");
    expect(prompt).not.toContain("--set");
    expect(shellQuote("a'b")).toBe("'a'\"'\"'b'");
  });
});
