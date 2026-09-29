import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackedFetch } from "@/api/request-activity";
import { ButtonGroup } from "@/components/ui/button-group";
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

/** Windows shells do not execute extensionless Python shebang files directly. */
export function agentSkillCommand(agent: AgentTarget, command: string) {
  const isWindows = navigator.userAgent.toLowerCase().includes("windows");
  return `${agentSkillRoots[agent]}/skills/agent-colab/bin/${command}${isWindows ? ".cmd" : ""}`;
}

type Props = {
  open: boolean;
  title: string;
  description: string;
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
  promptFor: (agent: AgentTarget) => string;
  onClose: () => void;
  onError: (message: string) => void;
};

/**
 * Shared handoff surface for every Colab context type. Files, Sessions and future Skills supply
 * only their prompt body; target selection, clipboard behavior and Agent launch stay consistent.
 */
export function AgentPromptDialog({
  open,
  title,
  description,
  defaultAgent,
  installedAgents,
  promptFor,
  onClose,
  onError,
}: Props) {
  async function copyAndOpen(agent: AgentTarget) {
    try {
      await navigator.clipboard.writeText(promptFor(agent));
      const response = await trackedFetch(`/v1/system/agents/${agent}/open`, { method: "POST" });
      if (!response.ok) throw new Error(await response.text());
      onClose();
    } catch (reason) {
      onError(String(reason));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="min-w-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <pre className="max-h-[50vh] min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">
          {promptFor(defaultAgent)}
        </pre>
        <DialogFooter>
          <ButtonGroup className="min-w-0 max-w-full">
            <Button
              className="min-w-0"
              disabled={!installedAgents[defaultAgent]?.installed}
              onClick={() => void copyAndOpen(defaultAgent)}
            >
              <span className="truncate">Copy and open {agentLabels[defaultAgent]}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="icon" aria-label="Other Agents" />}>
                <ChevronDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {(Object.keys(agentLabels) as AgentTarget[])
                    .filter((agent) => agent !== defaultAgent)
                    .map((agent) => (
                      <DropdownMenuItem
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
      </DialogContent>
    </Dialog>
  );
}
