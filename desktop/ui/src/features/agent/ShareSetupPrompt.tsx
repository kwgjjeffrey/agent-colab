import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentPromptDialog, agentSkillCommand, type AgentTarget } from "./AgentPromptDialog";

export const shellQuote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

export type ShareSetup = {
  kind: "files" | "skill";
  parentRef: string;
  sourcePath?: string;
  excludes?: string[];
  existingRef?: string;
};

export function shareSetupPrompt(agent: AgentTarget, setup: ShareSetup) {
  const browser = agentSkillCommand(agent, "colab-browser");
  const explorer = agentSkillCommand(agent, "colab-explorer");
  const exclusions = (setup.excludes ?? []).map(pattern => ` --exclude ${shellQuote(pattern)}`).join("");
  const scope = setup.existingRef
    ? `${browser} sync-scope --ref ${shellQuote(setup.existingRef)}\n${browser} sync-scope --ref ${shellQuote(setup.existingRef)} --set${exclusions}`
    : `${explorer} share --parent ${shellQuote(setup.parentRef)} --item-type ${setup.kind} --source ${shellQuote(setup.sourcePath ?? "<absolute-source-path>")}${exclusions}`;
  return `Help me ${setup.existingRef ? "configure synchronization for my existing Files item" : `select and share a local ${setup.kind === "files" ? "file or directory" : "Skill"}`} in Agent Colab.\n\nTarget directory:\n${explorer} open --ref ${shellQuote(setup.parentRef)}\n\n${setup.kind === "skill"
    ? `Discover exact Skill sources first:\n${agentSkillCommand(agent, "colab-skill-tool")} sources\n\nSelect one Skill root containing a valid SKILL.md, not an entire Skill collection.`
    : `Source: ${setup.sourcePath ? shellQuote(setup.sourcePath) : "ask me which local file or directory to share"}.\nInspect the scope before any mutation:\n${browser} inspect-source --source ${shellQuote(setup.sourcePath ?? "<absolute-source-path>")}${exclusions}\n\nReview included size and recommended exclusions. Only use exact supported directory names returned in candidates, not arbitrary globs. Preserve the project's .gitignore; Colab exclusions are separate.`}\n\nUse the following supported command${setup.existingRef ? "s" : ""} after confirming the exact source${setup.kind === "files" ? " and complete exclusion list" : ""} with me; replace placeholders rather than executing them literally:\n${scope}\n\n${setup.kind === "files" ? "--exclude may be repeated; --set replaces the complete list, and --set without --exclude clears it. " : ""}Do not share secrets or unrelated files. Do not create another item when configuring an existing one. If sharing succeeds but Catalog placement fails, move the reported existing asset instead of sharing again. Verify the returned receipt and re-open the target directory; registration may still be preparing, so do not claim synchronization is complete until it is actually ready.`;
}

/** Configuring a source is distinct from consuming an already-shared asset. */
export function ShareSetupPrompt({ setup, defaultAgent, installedAgents, onError }: {
  setup: ShareSetup; defaultAgent: AgentTarget; installedAgents: Record<string, {installed:boolean}>; onError: (message:string)=>void;
}) {
  const [open, setOpen] = useState(false);
  return <><Button variant="outline" onClick={()=>setOpen(true)}>Give to Agent</Button><AgentPromptDialog open={open} title={setup.existingRef ? "Configure Files with Agent" : `Share ${setup.kind === "files" ? "Files" : "a Skill"} with Agent`} description="Describe what you want to share; your Agent can select and configure the source." defaultAgent={defaultAgent} installedAgents={installedAgents} promptFor={agent=>shareSetupPrompt(agent,setup)} onClose={()=>setOpen(false)} onError={onError}/></>;
}
