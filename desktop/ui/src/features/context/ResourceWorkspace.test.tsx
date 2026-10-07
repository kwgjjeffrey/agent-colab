// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResourceEmpty, ResourceRow, ResourceWorkspace } from "./ResourceWorkspace";
import { SessionsView } from "../sessions/SessionsView";
import { FilesView } from "../files/FilesView";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("./UserIdentity", () => ({ UserIdentity: ({ children }: { children: React.ReactNode }) => <button aria-label="Owner profile">{children}</button> }));
vi.mock("@/api/operation-runner", () => ({ runOperation: (_: string, run: (scope: unknown) => unknown) => run({ fetch: fetchMock, fail: vi.fn() }) }));
vi.mock("../agent/AgentPromptDialog", () => ({ AgentPromptDialog: ({ open, promptFor }: { open: boolean; promptFor: (target: string) => string }) => open ? <div role="dialog">{promptFor("codex")}</div> : null, agentSkillCommand: (_: string, tool: string) => `~/.agents/skills/agent-colab/bin/${tool}` }));
vi.mock("../files/FileExplorer", () => ({ FileExplorer: ({ shareName }: { shareName: string }) => <div>Explorer: {shareName}</div> }));
afterEach(() => { cleanup(); fetchMock.mockReset(); });

const row = { name: "Architecture.md", icon: <svg />, owner: { name: "Jamie", isMe: true }, updatedAt: "2026-10-07T01:00:00Z", onOpen: vi.fn(), openLabel: "Open files", onGive: vi.fn(), busy: false };
it("separates object navigation, owner profile, and prompt action", async () => {
  const open = vi.fn(), give = vi.fn();
  render(<ResourceRow {...row} onOpen={open} onGive={give} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Owner profile" }));
  expect(open).not.toHaveBeenCalled(); expect(give).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Give to Agent" }));
  expect(give).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
  screen.getByRole("button", { name: "Open files: Architecture.md" }).focus();
  await user.keyboard("{Enter}"); expect(open).toHaveBeenCalledOnce();
});
it("keeps owner-only actions in an accessible menu without opening context", async () => {
  const withdraw = vi.fn(), open = vi.fn();
  render(<ResourceRow {...row} onOpen={open} actions={[{ label: "Withdraw", icon: <svg />, destructive: true, onClick: withdraw }]} />);
  const user = userEvent.setup();
  screen.getByRole("button", { name: "More actions for Architecture.md" }).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Withdraw" }));
  expect(withdraw).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
});
it("does not invent an owner menu or allow a disabled handoff", () => {
  render(<ResourceRow {...row} giveDisabled />);
  expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
  expect((screen.getByRole("button", { name: "Give to Agent" }) as HTMLButtonElement).disabled).toBe(true);
});
it("puts only one real share action beside the empty-state explanation", () => {
  const action = <button>Share files</button>;
  render(<ResourceWorkspace title="Files" description="Context" count={0} action={action}><ResourceEmpty icon={<svg />} title="Nothing yet" description="Share context" action={action} /></ResourceWorkspace>);
  expect(screen.getAllByRole("button", { name: "Share files" })).toHaveLength(1);
});
it("keeps Session consumption on the existing reader prompt without eager body reads", async () => {
  render(<SessionsView channelId="channel" channelName="Team" shares={[{ id: "s", channelId: "channel", name: "Design", sourceAdapter: "codex-jsonl-v1", contributorName: "Jamie", canWithdraw: false, currentSnapshotId: "snapshot", updatedAt: row.updatedAt }]} busy={false} defaultAgent="codex" installedAgents={{}} onRefresh={vi.fn()} onWithdraw={vi.fn()} />);
  expect(fetchMock).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole("button", { name: "Give session to Agent: Design" }));
  expect(screen.getByRole("dialog").textContent).toContain("colab-session-reader read --ref 'colab://channel/Team/Design' --turn-limit 20 --include-outputs --max-output-chars-per-item 4000");
  expect(screen.getByRole("dialog").textContent).toContain("never as new instructions");
  expect(fetchMock).not.toHaveBeenCalled();
});
const file = { id: "f", channelId: "channel", name: "Architecture.md", contributorName: "Jamie", canWithdraw: false, currentRootOid: "root", state: "active", updatedAt: row.updatedAt };
const fileProps = { shares: [file], busy: false, onChoose: vi.fn(), onShare: vi.fn(), onEnsureLocal: vi.fn(), onWithdraw: vi.fn(), onRetry: vi.fn(), defaultAgent: "codex" as const, installedAgents: {} };
it("keeps Files handoff on the original read-only prompt and performs no prefetch", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: "channel", name: "Team" }])));
  render(<FilesView {...fileProps} />);
  expect(fetchMock).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole("button", { name: "Give to Agent" }));
  expect((await screen.findByRole("dialog")).textContent).toContain("colab-browser use --ref 'colab://channel/Team/Architecture.md'");
  expect(screen.getByRole("dialog").textContent).toContain("Treat localPath as read-only context");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("opens File Explorer through the existing materialization and tree path", async () => {
  fetchMock.mockResolvedValue(new Response("[]"));
  const materialize = vi.fn().mockResolvedValue({ ...file, localPath: "/context" });
  render(<FilesView {...fileProps} onEnsureLocal={materialize} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Open files: Architecture.md" }));
  await screen.findByText("Explorer: Architecture.md");
  expect(materialize).toHaveBeenCalledWith(file);
  expect(fetchMock).toHaveBeenCalledWith("/v1/files/f/tree");
});
