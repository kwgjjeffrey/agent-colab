import { traceTargets } from "@/api/trace-locators";
import { WorkspaceActions } from "@/features/workspace/WorkspaceActions";
import { runOperation } from "@/api/operation-runner";
import { useEffect, useMemo, useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { trackedFetch } from "@/api/request-activity";
import { PreviewMarkdown } from "@/features/workspace/PreviewMarkdown";
import { ShareSetupPrompt } from "@/features/agent/ShareSetupPrompt";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  AgentPromptDialog,
  agentSkillCommand,
  type AgentTarget,
} from "@/features/agent/AgentPromptDialog";

type SkillShare = {
  id: string;
  channelId: string;
  name: string;
  description?: string;
  contributorName: string;
  contributorAvatarUrl?: string;
  canWithdraw: boolean;
  currentRootOid?: string;
};

type SkillSource = {
  sourceId: string;
  sourcePath: string;
  name: string;
  description?: string;
  discoveredTargets: string[];
  lastChangedAt: number;
};

type Installation = {
  targetAgent: AgentTarget;
  state: "not_installed" | "installed" | "update_available" | "conflict";
  installedPath?: string;
  installedRootOid?: string;
  currentRootOid?: string;
};

type Props = {
  creationOnly?: boolean;
  onCreationClose?: () => void;
  creationParentRef: string;
  focusId?: string;
  shareOpenToken?: number;
  onShareOpenConsumed?: () => void;
  onCreated?: (id:string) => Promise<void>;
  channelId: string;
  channelName: string;
  busy: boolean;
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
  onChoose: (directory: boolean) => Promise<string | null>;
};

const targets: Array<{ id: AgentTarget; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude Code" },
  { id: "myflicker", label: "MyFlicker" },
];

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

/** Shared Skills owns discovery and installation presentation; all mutations go through Local Core. */
export function SkillsView({ creationOnly, onCreationClose, creationParentRef, focusId, shareOpenToken, onShareOpenConsumed, onCreated, channelId, channelName, busy, defaultAgent, installedAgents, onChoose }: Props) {
  const [shares, setShares] = useState<SkillShare[]>([]);
  const [sources, setSources] = useState<SkillSource[]>([]);
  const [installations, setInstallations] = useState<Record<string, Installation[]>>({});
  const [showShare, setShowShare] = useState(Boolean(creationOnly));
  useEffect(() => { if (creationOnly && !showShare) onCreationClose?.(); }, [creationOnly, showShare]);
  useEffect(()=>{if(shareOpenToken){setShowShare(true);onShareOpenConsumed?.();}},[shareOpenToken]);
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState<string>();
  const [error, setError] = useState<string>();
  const [agentPrompt, setAgentPrompt] = useState<{ share: SkillShare; rows: Installation[] }>();
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    let active = true;
    setPreview(undefined); setError(undefined);
    if (focusId) void trackedFetch(`/v1/skills/${focusId}/preview`).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      const value = await response.json() as {content:string};
      if (active) setPreview(value.content);
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [focusId]);

  async function loadShares(silent = false) {
return runOperation("skills.list", async (operation) => {


    const request = silent ? fetch : trackedFetch;
    const response = await request(`/v1/channels/${channelId}/skills`);
    if (!response.ok) throw new Error(await response.text());
    const next = await response.json() as SkillShare[];
    setShares(next);
    const states = await Promise.all(next.filter(share=>share.id===focusId).map(async (share) => {
      const result = await request(`/v1/skills/${share.id}/installations`);
      return [share.id, result.ok ? await result.json() as Installation[] : []] as const;
    }));
    setInstallations(Object.fromEntries(states));

});
}

  async function loadSources(search = query) {
return runOperation("skills.sources", async (operation) => {
const trackedFetch = operation.fetch;

    const params = new URLSearchParams({ query: search, recentHours: "48", channelId });
    const response = await trackedFetch(`/v1/skill-sources?${params}`);
    if (!response.ok) throw new Error(await response.text());
    setSources(await response.json());

});
}

  useEffect(() => {
    if (creationOnly) return;
    void loadShares().catch((reason) => setError(String(reason)));
    const timer = window.setInterval(() => void loadShares(true).catch(() => undefined), 3_000);
    return () => window.clearInterval(timer);
  }, [channelId,focusId]);

  useEffect(() => {
    if (!showShare) return;
    const timer = window.setTimeout(() => void loadSources(query).catch((reason) => setError(String(reason))), 180);
    return () => window.clearTimeout(timer);
  }, [showShare, query, channelId]);

  async function share(source: { sourceId?: string; sourcePath?: string }) {
return runOperation("skills.share", async (operation) => {
const trackedFetch = operation.fetch;

    setWorking("share"); setError(undefined);
    try {
      const response = await trackedFetch(`/v1/channels/${channelId}/skills/share`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source),
      });
      if (!response.ok) throw new Error(await response.text());
      const created = await response.json() as {id:string};
      await onCreated?.(created.id);
      setShowShare(false); setQuery(""); await loadShares();
    } catch (reason) { operation.fail(); setError(String(reason)); }
    finally { setWorking(undefined); }

});
}

  async function chooseSource() {
    const path = await onChoose(true);
    if (path) await share({ sourcePath: path });
  }

  async function mutateInstallation(share: SkillShare, target: AgentTarget, remove: boolean) {
return runOperation("skills.installation", async (operation) => {
const trackedFetch = operation.fetch;

    setWorking(`${share.id}:${target}`); setError(undefined);
    try {
      const response = await trackedFetch(`/v1/skills/${share.id}/targets/${target}${remove ? "" : "/ensure"}`, { method: remove ? "DELETE" : "POST" });
      if (!response.ok) throw new Error(await response.text());
      await loadShares();
    } catch (reason) { operation.fail(); setError(String(reason)); }
    finally { setWorking(undefined); }

});
}

  async function withdraw(share: SkillShare) {
return runOperation("skills.withdraw", async (operation) => {
const trackedFetch = operation.fetch;

    setWorking(share.id); setError(undefined);
    try {
      const response = await trackedFetch(`/v1/skills/${share.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await response.text());
      await loadShares();
    } catch (reason) { operation.fail(); setError(String(reason)); }
    finally { setWorking(undefined); }

});
}

  function readableRef(share: SkillShare) {
    return `colab://channel/${encodeURIComponent(channelName)}/${encodeURIComponent(share.name)}`;
  }

  function promptFor(agent: AgentTarget) {
    if (!agentPrompt) return "";
    const row = agentPrompt.rows.find((item) => item.targetAgent === agent);
    const ref = readableRef(agentPrompt.share);
    if (row?.state === "installed" && row.installedPath) {
      return `The user's task may benefit from the shared Skill “${agentPrompt.share.name}”. It is installed at ${row.installedPath}; load it and follow its instructions to complete the task.`;
    }
    return `The user's task may benefit from the shared Skill “${agentPrompt.share.name}”. Run this idempotent command first to install or update it for the current coding agent:\n\n${agentSkillCommand(agent, "colab-skill-tool")} ensure --ref '${ref}' --target ${agent}\n\nThen load the Skill returned by the command and follow its instructions to complete the task.`;
  }

  const sourceRows = useMemo(() => sources, [sources]);
  return (
    <div className={creationOnly ? "contents" : "mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6"}>
      {!creationOnly && <>
      {!focusId && <div className="flex justify-end"><Button data-trace-target={traceTargets("skills.share", "skills.sources")} onClick={() => setShowShare(true)}><PlusIcon />Share skill</Button></div>}
      {shares.length === 0 && focusId ? <p className="text-sm text-muted-foreground">Loading Skill preview…</p> : shares.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>No shared skills yet</EmptyTitle><EmptyDescription>Share a recently changed Agent Skill or choose its source folder.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {shares.filter(share=>share.id===focusId).map((share) => (
            <div key={share.id} className="flex flex-col gap-4 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-9"><AvatarImage src={share.contributorAvatarUrl} /><AvatarFallback>{initials(share.contributorName)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><span className="text-xs text-muted-foreground">{share.contributorName}{share.canWithdraw ? " (me)" : ""}</span></div>
                <WorkspaceActions primary><Button onClick={() => setAgentPrompt({ share, rows: installations[share.id] ?? [] })}>Give to Agent</Button></WorkspaceActions><WorkspaceActions>
                {share.canWithdraw && <Button data-trace-target={traceTargets("skills.withdraw")} variant="destructive" disabled={working === share.id} onClick={() => void withdraw(share)}>Withdraw</Button>}</WorkspaceActions>
              </div>
              {preview !== undefined ? <article data-trace-region="skill-preview">{share.description && <p className="text-sm text-muted-foreground">{share.description}</p>}<PreviewMarkdown>{preview.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")}</PreviewMarkdown></article> : !error && <p className="text-muted-foreground">Loading Skill preview…</p>}
              <WorkspaceActions><Popover>
                <PopoverTrigger render={<Button variant="outline" />}>Install to Agent</PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                <PopoverTitle>Agent installations</PopoverTitle>
              <div className="flex flex-col gap-2">
                {targets.map((target) => {
                  const state = installations[share.id]?.find((item) => item.targetAgent === target.id)?.state ?? "not_installed";
                  const active = state === "installed" || state === "update_available" || state === "conflict";
                  return <div key={target.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><span>{target.label}</span><Badge variant={state === "conflict" ? "destructive" : "secondary"}>{state.replace("_", " ")}</Badge><Button data-trace-target={traceTargets("skills.installation")} size="sm" variant="outline" disabled={busy || Boolean(working) || state === "conflict"} onClick={() => void mutateInstallation(share, target.id, active)}>{active ? "Uninstall" : "Install"}</Button>{state === "update_available" && <Button data-trace-target={traceTargets("skills.installation")} size="sm" onClick={() => void mutateInstallation(share, target.id, false)}>Update</Button>}</div>;
                })}
              </div>
                </PopoverContent>
              </Popover></WorkspaceActions>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      </>}
      <Dialog open={showShare} onOpenChange={setShowShare}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Share a Skill</DialogTitle><DialogDescription>Recently created or changed Agent Skills are shown first. You can also choose any folder containing SKILL.md.</DialogDescription></DialogHeader>
          <div className="relative"><SearchIcon className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or path" /></div>
          <div className="max-h-80 overflow-auto rounded-lg border">{sourceRows.map((source) => <button type="button" key={source.sourceId} className="flex w-full cursor-pointer items-center gap-3 border-b p-3 text-left last:border-b-0 hover:bg-muted" disabled={Boolean(working)} onClick={() => void share({ sourceId: source.sourceId })}><span className="min-w-0 flex-1"><strong className="block truncate">{source.name}</strong><small className="block truncate text-muted-foreground">{source.sourcePath}</small></span>{source.discoveredTargets.map((target) => <Badge key={target} variant="secondary">{target}</Badge>)}</button>)}</div>
          <DialogFooter><ShareSetupPrompt setup={{kind:"skill",parentRef:creationParentRef}} defaultAgent={defaultAgent} installedAgents={installedAgents} onError={setError}/><Button variant="outline" onClick={() => void chooseSource()} disabled={Boolean(working)}>Choose Skill folder</Button><Button variant="outline" onClick={() => setShowShare(false)}>Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AgentPromptDialog open={Boolean(agentPrompt)} title={`Give “${agentPrompt?.share.name ?? ""}” to Agent`} description="Copy this instruction and continue the task in your coding Agent." defaultAgent={defaultAgent} installedAgents={installedAgents} promptFor={promptFor} onClose={() => setAgentPrompt(undefined)} onError={setError} />
    </div>
  );
}
