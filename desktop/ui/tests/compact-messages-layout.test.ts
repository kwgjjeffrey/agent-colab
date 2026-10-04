import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const timeline = readFileSync(new URL("../src/features/messages/MessageTimeline.tsx", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/features/messages/MessagesView.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/features/messages/AgentMessageComposer.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

describe("compact Discord-style Messages layout", () => {
  it("mounts the Agent manager when global Settings is invoked from another tab and consumes the intent", () => {
    expect(shell).toContain('setWorkspaceTab("messages");setAgentSettingsOpenToken');
    expect(shell).toContain('<Tabs value={workspaceTab} onValueChange={setWorkspaceTab}');
    expect(shell).toContain('onSettingsOpenConsumed={()=>setAgentSettingsOpenToken(0)}');
    expect(view).toContain('onSettingsOpenConsumed?.()');
    expect(view).toContain('openManager("settings", me).catch');
  });
  it("renders messages as flat rows rather than identity-colored bubbles", () => {
    expect(timeline).toContain("hover:bg-muted/40");
    expect(timeline).not.toContain("rounded-2xl px-3 py-2");
    expect(timeline).not.toContain("flex-row-reverse");
  });

  it("keeps members and Agents on the same flat roster level", () => {
    expect(view).toContain("sortedParticipants.flatMap");
    expect(view).not.toContain("pl-6");
    expect(view).toContain("<AgentMemberItem");
    expect(view).not.toContain("setWorkRequest(requests[0])");
    expect(view).toContain('openManager("channel", person)');
    expect(view).not.toContain('openManager("settings", person)');
  });

  it("uses one borderless composer surface with a solid arrow action", () => {
    expect(composer).toContain("ArrowUpIcon");
    expect(composer).not.toContain("rounded-xl border bg-background");
  });

  it("keeps Channel identity and Quick Share in one compact header row", () => {
    expect(shell).toContain('className="flex shrink-0 items-center gap-3 px-8 pt-5 pb-3"');
    expect(shell).toContain('className="flex items-center border-b px-8"');
  });

  it("does not reserve a permanent titlebar status strip", () => {
    expect(shell).not.toContain("app-titlebar-drag");
    expect(shell).not.toContain('agentActivityLabel(workingAgents)');
  });
});
