import { traceTargets } from "@/api/trace-locators";
import { operations } from "@/api/trace-operations";
import { runOperation, type OperationScope } from "@/api/operation-runner";
import { useEffect, useState } from "react";
import { useChannelContext } from "@/features/context/ChannelContext";
import { ResourceWorkspace, ResourceEmpty, ResourceRow } from "@/features/context/ResourceWorkspace";
import { FileTypeIcon } from "@/features/context/ContextIcon";
import { CheckIcon, PlusIcon, FolderOpenIcon, SlidersHorizontalIcon, UnplugIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackedFetch } from "@/api/request-activity";
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
  useEffect(() => { const row = shares.find(row => row.id === focusId); if (row) void browse(row); }, [focusId]);
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

  async function browse(share: FileShare) {
return runOperation("files.browse", async (operation) => {
const trackedFetch = operation.fetch;

    if (openShare === share.id) return setOpenShare(undefined);
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
  if (browsedShare) {
    return <FileExplorer shareId={browsedShare.id} shareName={browsedShare.name} entries={entries} onClose={() => setOpenShare(undefined)} />;
  }

  return (
    <ResourceWorkspace title="Files" description="Shared context, kept close to its source." count={shares.length} action={<Button data-trace-target={traceTargets("files.share", "files.choose", "system.choose-path")} disabled={busy} onClick={() => void choose()}><PlusIcon data-icon="inline-start" />Share files</Button>}>
      {shares.length === 0 ? (
        <ResourceEmpty icon={<FolderOpenIcon />} title="No shared files yet" description="Share a file or folder. Your team’s Agents can work with the original context." action={<Button data-trace-target={traceTargets("files.share", "files.choose", "system.choose-path")} disabled={busy} onClick={() => void choose()}><PlusIcon data-icon="inline-start" />Share files</Button>} />
      ) : (
        <div className="resource-list">
          {shares.map((share) => (
            <ResourceRow key={share.id} name={share.name} icon={<FileTypeIcon name={share.name} />} owner={{ id: share.contributorMemberId, name: share.contributorName, avatarUrl: share.contributorAvatarUrl, isMe: share.canWithdraw }} updatedAt={share.updatedAt} updateLabel={share.currentRootOid ? "Last synced" : "Shared"} onOpen={() => void browse(share)} openLabel="Open files" trace={traceTargets("files.browse", "files.materialize")} onGive={() => void giveToAgent(share)} giveTrace={traceTargets("files.handoff")} giveDisabled={!share.currentRootOid} busy={busy} status={share.syncState && share.syncState !== "ready" ? <span className={share.syncState === "failed" ? "text-destructive" : undefined}>{share.syncState === "failed" ? share.syncError || "Synchronization failed" : share.syncState === "preparing" ? "Preparing first snapshot…" : "Synchronizing…"}</span> : undefined} trailing={share.syncState === "failed" ? <Button data-trace-target={traceTargets("files.retry")} variant="outline" size="sm" disabled={busy} onClick={() => onRetry(share)}>Retry</Button> : undefined} actions={share.canWithdraw ? [
              { label: "Sync scope", icon: <SlidersHorizontalIcon />, trace: traceTargets("files.scope.read", "files.inspect"), onClick: () => void editScope(share) },
              { label: "Withdraw", icon: <UnplugIcon />, destructive: true, trace: traceTargets("files.withdraw"), onClick: () => onWithdraw(share) },
            ] : []} />
          ))}
        </div>
      )}
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
    </ResourceWorkspace>
  );
}
