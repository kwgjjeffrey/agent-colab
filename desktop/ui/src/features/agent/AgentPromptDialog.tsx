import { artifactConfig } from "@/artifact-config";
import { AgentButton } from "@/features/agent/AgentButton";
import { traceTargets } from "@/api/trace-locators";
import { runOperation } from "@/api/operation-runner";
import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { trackedFetch } from "@/api/request-activity";
import { ButtonGroup } from "@/components/ui/button-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AgentTarget = "codex" | "claude" | "myflicker";

const agentLabels: Record<AgentTarget, string> = {
  codex: "Codex",
  claude: "Claude Code",
  myflicker: "MyFlicker",
};

export const agentSkillRoots: Record<AgentTarget, string> = {
  codex: "~/.agents",
  claude: "~/.claude",
  myflicker: "~/.myflicker",
};

export function agentSkillDirectory(agent: AgentTarget) {
  return `${agentSkillRoots[agent]}/skills/${artifactConfig.skill.name}`;
}

/** Windows shells do not execute extensionless Python shebang files directly. */
export function agentSkillCommand(agent: AgentTarget, command: string) {
  const isWindows = navigator.userAgent.toLowerCase().includes("windows");
  return `${agentSkillRoots[agent]}/skills/${artifactConfig.skill.name}/bin/${command}${isWindows ? ".cmd" : ""}`;
}

type Props = {
  loading?: boolean;
  preparationError?: string;
  onRetry?: () => void;
  open: boolean;
  title: string;
  description: string;
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
  promptFor: (agent: AgentTarget) => string;
  onClose: () => void;
  onError: (message: string) => void;
  onDelivered?: () => void;
  onForward?: (query: string) => void;
  sendTraceTarget?: string;
  onSend?: (query: string) => Promise<void>;
};

/**
 * Shared handoff surface for every Colab context type. Files, Sessions and future Skills supply
 * only their prompt body; target selection, clipboard behavior and Agent launch stay consistent.
 */
export function AgentPromptDialog({
  loading = false,
  preparationError,
  onRetry,
  open,
  title,
  description,
  defaultAgent,
  installedAgents,
  promptFor,
  onClose,
  onError,
  onForward,
  onSend,
  sendTraceTarget,
  onDelivered,
}: Props) {
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const unavailable = loading || Boolean(preparationError);
  function reportError(message: string) {
    setError(message);
    onError(message);
  }
  const completePrompt = (agent: AgentTarget) => `${promptFor(agent)}${query.trim() ? `\n\nUser query:\n${query.trim()}` : ""}`;
  async function copyAndOpen(agent: AgentTarget) {
return runOperation("prompt.open-agent", async (operation) => {
const trackedFetch = operation.fetch;

    try {
      const content = completePrompt(agent);
      operation.prompt(content, "context.handoff", agent);
      await navigator.clipboard.writeText(content);
      const response = await trackedFetch(`/v1/system/agents/${agent}/open`, { method: "POST" });
      if (!response.ok) throw new Error(await response.text());
      onDelivered?.();
      onClose();
    } catch (reason) { operation.fail();
      reportError(String(reason));
    }

});
}

  async function copyPrompt() {
    return runOperation("prompt.copy", async (operation) => {
      try { const content = completePrompt(defaultAgent); operation.prompt(content, "context.handoff", defaultAgent); await navigator.clipboard.writeText(content); onDelivered?.(); onClose(); }
      catch (reason) { operation.fail(); reportError(String(reason)); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent data-trace-region={"prompt"} className="min-w-0 sm:max-w-2xl">
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle className="min-w-0 break-words">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {loading ? <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Spinner />Preparing Agent prompt…</div> : preparationError ? <div className="flex flex-col gap-3"><p role="alert" className="text-sm text-destructive">{preparationError}</p>{onRetry && <Button variant="outline" onClick={onRetry}>Retry</Button>}</div> : <pre className="max-h-[50vh] min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">
          {completePrompt(defaultAgent)}
        </pre>}
        <div className="flex flex-col gap-3">
          <label htmlFor="agent-prompt-query" className="text-sm font-medium">User query</label>
          <Textarea id="agent-prompt-query" className="min-h-24 resize-y border-transparent bg-muted px-4 py-3 shadow-none focus-visible:border-ring/40 focus-visible:ring-0 dark:bg-muted" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add an instruction for this task (optional)" />
        </div>
        <DialogFooter>
          {onForward && <AgentButton disabled={unavailable} onClick={() => onForward(query.trim())}>Forward to collaborators’ agent</AgentButton>}
          {onSend && <AgentButton data-trace-target={sendTraceTarget} disabled={sending} onClick={async () => { setError(undefined); setSending(true); try { await onSend(query.trim()); onClose(); setQuery(""); } catch (reason) { reportError(String(reason)); } finally { setSending(false); } }}>{sending ? "Sending…" : "Send to Agent"}</AgentButton>}
          <Button disabled={unavailable} data-trace-target={traceTargets("prompt.copy")} onClick={() => void copyPrompt()}>Copy prompt</Button>
          <ButtonGroup className="min-w-0 max-w-full">
            <AgentButton data-trace-target={traceTargets("prompt.open-agent")}
              className="min-w-0"
              disabled={unavailable || !installedAgents[defaultAgent]?.installed}
              onClick={() => void copyAndOpen(defaultAgent)}
            >
              <span className="truncate">Copy and open {agentLabels[defaultAgent]}</span>
            </AgentButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="agent" disabled={unavailable} size="icon" aria-label="Other Agents" />}>
                <ChevronDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {(Object.keys(agentLabels) as AgentTarget[])
                    .filter((agent) => agent !== defaultAgent)
                    .map((agent) => (
                      <DropdownMenuItem data-trace-target={traceTargets("prompt.open-agent")}
                        key={agent}
                        disabled={!installedAgents[agent]?.installed}
                        onClick={() => void copyAndOpen(agent)}
                      >
                        Copy and open {agentLabels[agent]}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </DialogFooter>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
