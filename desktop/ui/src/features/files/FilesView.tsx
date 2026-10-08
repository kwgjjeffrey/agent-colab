import { traceTargets } from "@/api/trace-locators";
import { WorkspaceActions } from "@/features/workspace/WorkspaceActions";
import { operations } from "@/api/trace-operations";
import { runOperation, type OperationScope } from "@/api/operation-runner";
import { useEffect, useState } from "react";
import { useChannelContext } from "@/features/context/ChannelContext";
import { UserIdentity } from "@/features/context/UserIdentity";
import { FileTypeIcon } from "@/features/context/ContextIcon";
import { CheckIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackedFetch } from "@/api/request-activity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AgentPromptDialog,
  agentSkillCommand,
  type AgentTarget,
} from "@/features/agent/AgentPromptDialog";
import { FileExplorer, type LocalFileEntry } from "@/features/files/FileExplorer";

export type FileShare = {
  id: string;
  channelId: string;
  name: string;
  contributorName: string;
  contributorMemberId?: string;
  contributorAvatarUrl?: string;
  state: string;
  currentRootOid?: string;
  canWithdraw: boolean;
  updatedAt: string;
  localPath?: string;
  syncState?: "preparing" | "syncing" | "failed" | "ready";
  syncError?: string;
};

type Props = {
  shareOpenToken?: number;
  onShareOpenConsumed?: () => void;
  focusId?: string;
  shares: FileShare[];
  busy: boolean;
  onChoose: (directory?: boolean) => Promise<string | null>;
  onShare: (path: string, syncExcludes: string[], parent?: OperationScope) => Promise<void>;
  onEnsureLocal: (share: FileShare) => Promise<FileShare>;
  onWithdraw: (share: FileShare) => void;
  onRetry: (share: FileShare) => void;
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
};

type SourceInspection = {
  localPath: string;
  includedFiles: number;
  includedBytes: number;
  excludedFiles: number;
  excludedBytes: number;
  projectIgnoreApplied: boolean;
  exceedsTransportLimit: boolean;
  candidates: Array<{
    pattern: string;
    fileCount: number;
    byteSize: number;
    selected: boolean;
  }>;
};

/** Files owns only presentation and local browsing; synchronization remains a Local Core use case. */
export function FilesView({
  shareOpenToken,
  onShareOpenConsumed,
  focusId,
  shares,
  busy,
  onChoose,
  onShare,
  onEnsureLocal,
  onWithdraw,
  onRetry,
  defaultAgent,
  installedAgents,
}: Props) {
  const context = useChannelContext();
  useEffect(()=>{if(shareOpenToken){void choose();onShareOpenConsumed?.();}},[shareOpenToken]);
  const focusAvailable = shares.some(row => row.id === focusId);
  useEffect(() => { const row = shares.find(row => row.id === focusId); if (row) void browse(row, true); }, [focusId, focusAvailable]);
  const [openShare, setOpenShare] = useState<string>();
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [agentPrompt, setAgentPrompt] = useState<{ id: string; ref: string; shareName: string }>();
  const [browseError, setBrowseError] = useState<string>();
  const [inspection, setInspection] = useState<SourceInspection>();
  const [inspecting, setInspecting] = useState(false);
  const [selectedExcludes, setSelectedExcludes] = useState<string[]>([]);
  const [scopeShareId, setScopeShareId] = useState<string>();

  async function localShare(share: FileShare) {
    return share.localPath ? share : await onEnsureLocal(share);
  }

  async function browse(share: FileShare, forceOpen = false) {
return runOperation("files.browse", async (operation) => {
const trackedFetch = operation.fetch;

    if (!forceOpen && openShare === share.id) return setOpenShare(undefined);
    setBrowseError(undefined);
    try {
      const local = await localShare(share);
      const response = await trackedFetch(
        `/v1/files/${local.id}/tree`,
      );
      if (!response.ok) return setBrowseError(await response.text());
      setEntries(await response.json());
      setOpenShare(local.id);
      // Consumption is cache-first. Refresh runs in the background and never blocks browsing.
      if (!share.canWithdraw && share.localPath) void onEnsureLocal(share);
    } catch (reason) { operation.fail();
      setBrowseError(String(reason));
    }

});
}

  async function giveToAgent(share: FileShare) {
return runOperation("files.handoff", async (operation) => {
const trackedFetch = operation.fetch;

    try {
      const channel = await trackedFetch("/v1/channels")
        .then((response) => response.json())
        .then((rows) => rows.find((row: { id: string }) => row.id === share.channelId));
      if (!channel) throw new Error("Channel is unavailable");
      const segment = (value: string) => encodeURIComponent(value);
      const ref = `colab://channel/${segment(channel.name)}/${segment(share.name)}`;
      setAgentPrompt({ id: share.id, ref, shareName: share.name });
    } catch (reason) { operation.fail();
      setBrowseError(String(reason));
    }

});
}

  function promptFor(agent: AgentTarget) {
    if (!agentPrompt) return "";
    return `The user's task may rely on context in the shared Files item “${agentPrompt.shareName}”. Run this command first; it updates the shared content locally and returns its root localPath and file tree:

${agentSkillCommand(agent, "colab-browser")} use --ref '${agentPrompt.ref}'

Treat localPath as read-only context. Use your file tools to read only the files relevant to the task, then complete the user's request.`;
  }

  async function inspect(path: string, excludes: string[], useRecommendations = false): Promise<void> {
return runOperation("files.inspect", async (operation) => {
const trackedFetch = operation.fetch;

    setInspecting(true);
    setBrowseError(undefined);
    try {
      const response = await trackedFetch("/v1/files/inspect-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localPath: path, syncExcludes: excludes }),
      });
      if (!response.ok) throw new Error(await response.text());
      const value: SourceInspection = await response.json();
      if (useRecommendations) {
        const recommended = value.candidates.map((candidate) => candidate.pattern);
        setSelectedExcludes(recommended);
        if (recommended.length > 0) return await inspect(path, recommended, false);
      }
      setSelectedExcludes(excludes);
      setInspection(value);
    } catch (reason) { operation.fail();
      setBrowseError(String(reason));
    } finally {
      setInspecting(false);
    }

});
}

  async function choose() {
    const path = await onChoose();
    if (path) {
      setScopeShareId(undefined);
      await inspect(path, [], true);
    }
  }

  async function editScope(share: FileShare) {
return runOperation("files.scope.read", async (operation) => {
const trackedFetch = operation.fetch;

    setInspecting(true);
    setBrowseError(undefined);
    try {
      const response = await trackedFetch(`/v1/files/${share.id}/sync-scope`);
      if (!response.ok) throw new Error(await response.text());
      const value: SourceInspection = await response.json();
      setScopeShareId(share.id);
      setSelectedExcludes(value.candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.pattern));
      setInspection(value);
    } catch (reason) { operation.fail();
      setBrowseError(String(reason));
    } finally {
      setInspecting(false);
    }

});
}

  async function toggleExclude(pattern: string) {
    if (!inspection) return;
    const next = selectedExcludes.includes(pattern)
      ? selectedExcludes.filter((value) => value !== pattern)
      : [...selectedExcludes, pattern];
    await inspect(inspection.localPath, next);
  }

  async function confirmShare() {
return runOperation("files.scope.commit", async (operation) => {
const trackedFetch = operation.fetch;

    if (!inspection) return;
    if (scopeShareId) {
      const response = await trackedFetch(`/v1/files/${scopeShareId}/sync-scope`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ syncExcludes: selectedExcludes }),
      });
      if (!response.ok) throw new Error(await response.text());
    } else {
      await onShare(inspection.localPath, selectedExcludes, operation);
    }
    setInspection(undefined);
    setSelectedExcludes([]);
    setScopeShareId(undefined);

});
}

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  };

  const browsedShare = shares.find((share) => share.id === openShare);
  return (
    <div className={browsedShare?"flex min-h-0 flex-1 flex-col":"mx-auto flex max-w-4xl flex-col gap-5 py-6"}>
      {browsedShare ? <><WorkspaceActions><Button variant="outline" onClick={()=>void giveToAgent(browsedShare)}>Give to Agent</Button>{browsedShare.canWithdraw&&<><Button variant="outline" onClick={()=>void editScope(browsedShare)}>Sync scope</Button><Button variant="destructive" onClick={()=>onWithdraw(browsedShare)}>Withdraw</Button></>}</WorkspaceActions><FileExplorer shareId={browsedShare.id} shareName={browsedShare.name} entries={entries} onClose={() => setOpenShare(undefined)}/></> : <><div className="flex justify-end">
        <Button data-trace-target={traceTargets("files.share", "files.choose", "system.choose-path")} disabled={busy} onClick={() => void choose()}>
          <PlusIcon /> Share files
        </Button>
      </div>
      {shares.length === 0 ? (
        <Empty className="min-h-[60vh]">
          <EmptyHeader>
            <EmptyTitle>No shared files yet</EmptyTitle>
            <EmptyDescription>
              Share a local file or folder to make its context available to this
              Channel.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="divide-y rounded-xl border">
          {shares.map((share) => (
            <div key={share.id} className="group flex items-center gap-3 p-4 text-sm">
                <button data-trace-target={traceTargets("files.browse", "files.materialize")}
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => void browse(share)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileTypeIcon name={share.name} className="size-5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{share.name}</span>
                  </span>
                  {share.syncState && share.syncState !== "ready" && (
                    <p className={share.syncState === "failed" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                      {share.syncState === "failed" ? share.syncError || "Synchronization failed" : share.syncState === "preparing" ? "Preparing first snapshot…" : "Synchronizing…"}
                    </p>
                  )}
                </button>
                <UserIdentity id={share.contributorMemberId} name={share.contributorName}><span className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground"><Avatar className="size-4"><AvatarImage src={share.contributorAvatarUrl} alt="" /><AvatarFallback className="text-[9px]">{share.contributorName.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>{share.contributorName}{share.canWithdraw ? " (me)" : ""}</span></UserIdentity>
                {share.syncState === "failed" && (
                  <Button data-trace-target={traceTargets("files.retry")} variant="outline" disabled={busy} onClick={() => onRetry(share)}>
                    Retry
                  </Button>
                )}
                {share.canWithdraw && (
                  <Button data-trace-target={traceTargets("files.scope.read", "files.inspect")} variant="outline" className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" disabled={busy} onClick={() => void editScope(share)}>
                    Sync scope
                  </Button>
                )}
                <Button data-trace-target={traceTargets("files.handoff")}
                  variant="outline"
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  disabled={busy || !share.currentRootOid}
                  onClick={() => void giveToAgent(share)}
                >
                  Give to Agent
                </Button>
                {share.canWithdraw && (
                  <Button data-trace-target={traceTargets("files.withdraw")}
                    variant="destructive"
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    disabled={busy}
                    onClick={() => void onWithdraw(share)}
                  >
                    Withdraw
                  </Button>
                )}
            </div>
          ))}
        </div>
      )}
      </>}
      <AgentPromptDialog
        open={Boolean(agentPrompt)}
        title={`Give “${agentPrompt?.shareName ?? ""}” to Agent`}
        description="Copy this instruction and continue the task in your coding Agent."
        defaultAgent={defaultAgent}
        installedAgents={installedAgents}
        promptFor={promptFor}
        onClose={() => setAgentPrompt(undefined)}
        onError={setBrowseError}
        onForward={context ? () => { const share = shares.find(row => row.id === agentPrompt?.id); if (!share) return setBrowseError("This context is no longer available."); setAgentPrompt(undefined); context.forward([{ kind: "files", ...share }]); } : undefined}
      />
      <Dialog open={Boolean(inspection) || inspecting} onOpenChange={(open) => !open && !inspecting && setInspection(undefined)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{scopeShareId ? "Edit synchronization scope" : "Review synchronization scope"}</DialogTitle>
            <DialogDescription>
              Colab stores these exclusions outside the source folder and never changes its Git configuration.
            </DialogDescription>
          </DialogHeader>
          {inspecting && !inspection ? (
            <p className="py-8 text-center text-muted-foreground">Scanning files…</p>
          ) : inspection ? (
            <div className="grid gap-4">
              <p className="truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">{inspection.localPath}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3"><strong className="block">Included</strong><span className="text-muted-foreground">{inspection.includedFiles} files · {formatBytes(inspection.includedBytes)}</span></div>
                <div className="rounded-lg border p-3"><strong className="block">Excluded</strong><span className="text-muted-foreground">{inspection.excludedFiles} files · {formatBytes(inspection.excludedBytes)}</span></div>
              </div>
              {inspection.projectIgnoreApplied && <p className="text-xs text-muted-foreground">The project’s existing .gitignore is honored read-only.</p>}
              {inspection.candidates.length > 0 && (
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Generated directories</p>
                  {inspection.candidates.map((candidate) => (
                    <Button key={candidate.pattern} type="button" variant="ghost" className="justify-start" disabled={inspecting} onClick={() => void toggleExclude(candidate.pattern)}>
                      <span className="flex size-5 items-center justify-center rounded border">{selectedExcludes.includes(candidate.pattern) && <CheckIcon className="size-3" />}</span>
                      <span className="flex-1 text-left">{candidate.pattern}/</span>
                      <span className="text-muted-foreground">{candidate.fileCount} files · {formatBytes(candidate.byteSize)}</span>
                    </Button>
                  ))}
                </div>
              )}
              {inspection.exceedsTransportLimit && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">The selected content exceeds the current 200 MiB transport limit. Exclude generated directories or choose a narrower source.</p>}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={inspecting || busy} onClick={() => setInspection(undefined)}>Cancel</Button>
            <Button data-trace-target={traceTargets("files.scope.commit")} disabled={!inspection || inspecting || busy || inspection.exceedsTransportLimit} onClick={() => void confirmShare()}>{scopeShareId ? "Save scope" : "Share"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {browseError && <p className="text-sm text-destructive">{browseError}</p>}
    </div>
  );
}
