// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelIconPicker } from "./ChannelIcon";
import { channelIconPrompt } from "./ChannelIconPrompt";
afterEach(cleanup);

describe("Channel icon handoff", () => {
  it("opens the standard prompt immediately without submitting the identity form", () => {
    const submit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={submit}><ChannelIconPicker channelId="selected-channel" name="Team" disabled={false} defaultAgent="codex" installedAgents={{codex:{installed:true}}} /></form>);
    expect(screen.getByRole("button", {name:"Upload image"})).toBeTruthy();
    expect(screen.getByRole("button", {name:"Generate icon from lib"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name:"Generate icon via agent"}));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Generate Channel icon", {exact:true})).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("targets the selected Channel and installed tool, not a duplicate readable name", () => {
    const prompt = channelIconPrompt("claude", {id:"selected-channel",name:"Team's / repeated name"});
    expect(prompt).toContain("~/.claude/skills/agent-colab/bin/colab-browser update-channel --channel 'colab://channel/selected-channel' --icon-file '<absolute-icon-path>'");
    expect(prompt).not.toContain("--name");
    expect(prompt).toContain("256 KiB");
    expect(prompt).toContain("image generation alone is not a completed icon update");
  });

  it("refreshes the form after an authoritative Agent update", () => {
    const props = {channelId:"selected",name:"Team",disabled:false,defaultAgent:"codex" as const,installedAgents:{}};
    const {container,rerender} = render(<ChannelIconPicker {...props} icon="https://example.test/old.png" />);
    rerender(<ChannelIconPicker {...props} icon="https://example.test/new.png" />);
    expect((container.querySelector('input[name="icon"]') as HTMLInputElement).value).toBe("https://example.test/new.png");
  });
});
