import { AgentButton } from "@/features/agent/AgentButton";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AgentPromptDialog, agentSkillRoots, agentSkillCommand, type AgentTarget } from "@/features/agent/AgentPromptDialog";
import { shellQuote } from "@/features/agent/ShareSetupPrompt";
import type { AddKind } from "@/features/workspace/CatalogWorkspace";

export function workspaceSetupPrompt(agent: AgentTarget, channel: { id: string; name: string }) {
  return `Help me set up my Agent Colab Channel ${JSON.stringify(channel.name)} according to my request below.\n\nFirst read the installed Skill at ${agentSkillRoots[agent]}/skills/agent-colab/SKILL.md. Use its supported tools through Local Core. Inspect this exact Channel before making changes:\n${agentSkillCommand(agent, "colab-explorer")} open --ref ${shellQuote(`colab://channel/${channel.id}`)}\n\nFollow my requirements to organize Catalogs, create or edit shared Canvas documents, or share Sessions, Files and Skills. Reuse existing items where appropriate. Ask me to identify local sources and confirm sharing scope and exclusions before sharing; never share secrets or unrelated files. Do not invite people or send messages unless I ask. Verify changes by reopening the Channel, and distinguish a sharing registration receipt from completed synchronization. If I have not supplied a concrete request, ask what I want to accomplish instead of inventing changes.`;
}

const actions: Array<{ kind: AddKind; label: string; description: string }> = [
  { kind: "session", label: "Share my Session", description: "Let teammates back you up, or use their own Agent to understand your work details and progress." },
  { kind: "files", label: "Share my Files", description: "Git feels too heavy? Share your work, documents or codebase, with changes continuously synchronized." },
  { kind: "skill", label: "Share my Skills", description: "Share useful practices and experience you’ve captured as Skills with your team." },
  { kind: "canvas", label: "Add a Canvas", description: "Plan goals or discuss ideas in a shared document that people and Agents can edit together, with real-time synchronization across devices." },
  { kind: "catalog", label: "Catalog", description: "Group and organize related context documents." },
];

export function HomeActions({ channel, onAdd, quickShare, defaultAgent, installedAgents, onError }: {
  channel: { id: string; name: string };
  onAdd: (kind: AddKind) => void;
  quickShare: ReactNode;
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <section aria-label="Channel actions" className="flex flex-col gap-4">
      <div className="grid items-center gap-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-6">
        <AgentButton className="w-full justify-start" onClick={() => setOpen(true)}>Call my Agent</AgentButton>
        <p className="text-sm text-muted-foreground">Ask your Agent to set up this Channel workspace and share context according to your requirements.</p>
      </div>
      {actions.map(action => <div key={action.kind} className="grid items-center gap-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-6">
        <Button variant="outline" className="w-full justify-start" onClick={() => onAdd(action.kind)}>{action.label}</Button>
        <p className="text-sm text-muted-foreground">{action.description}</p>
      </div>)}
      <div className="grid items-center gap-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-6">
        <div className="[&>button]:w-full">{quickShare}</div>
        <p className="text-sm text-muted-foreground">Share directly with someone without adding them to this Channel.</p>
      </div>
    </section>
    <AgentPromptDialog open={open} title="Call my Agent" description="Tell your Agent what you want to accomplish in this Channel." defaultAgent={defaultAgent} installedAgents={installedAgents} promptFor={agent => workspaceSetupPrompt(agent, channel)} onClose={() => setOpen(false)} onError={onError} />
  </>;
}
