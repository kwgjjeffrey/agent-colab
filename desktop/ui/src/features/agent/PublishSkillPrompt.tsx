import { useState } from "react";
import { AgentButton } from "./AgentButton";
import { AgentPromptDialog, agentSkillCommand, type AgentTarget } from "./AgentPromptDialog";
import { shellQuote } from "./ShareSetupPrompt";

export function publishSkillPrompt(agent: AgentTarget, channelId: string, channelName: string, parentRef: string) {
  const tool = agentSkillCommand(agent, "colab-skill-release");
  return `Add Colab as an artifact release target for this Skill project. Preserve existing GitHub/CDN release targets. Publish from the source project, without installing it into my local Skill directory.\n\nTarget Channel: ${channelName} (${channelId}).\n\nInspect the actual Skill root, versioning, build and tests. Replace placeholders with the project's real values:\n${tool} init --project '<absolute-project-path>' --skill-dir '<repo-relative-skill-root>' --channel ${shellQuote(channelId)} --package '<stable-package-name>' --parent ${shellQuote(parentRef)}\n\nThis creates colab-release.json and scripts/publish-colab-skill.py. Configure buildCommands and validationCommands as argv arrays using the project's existing commands. If the existing release pipeline already builds a distributable ZIP, set artifactFile to its project-relative path. Otherwise the scaffold packages Git-tracked files under skillDirectory. Keep credentials and unrelated files out of the artifact.\n\nCommit the scaffold and source changes, then publish:\npython3 scripts/publish-colab-skill.py --version '<new-version>' --notes '<release-notes>'\n\nThe command uploads through authenticated Local Core and verifies the original archive by downloading it again. Check the receipt and Channel item before reporting success. Reuse the same package identity for subsequent versions; versions are immutable. For an existing collaborator-owned publication, set referenceId in colab-release.json after obtaining publisher access. Do not execute literal placeholders.`;
}

export function PublishSkillPrompt({channelId, channelName, parentRef, defaultAgent, installedAgents, onError}: {
  channelId:string; channelName:string; parentRef:string; defaultAgent:AgentTarget; installedAgents:Record<string,{installed:boolean}>; onError:(message:string)=>void;
}) {
  const [open,setOpen] = useState(false);
  return <><AgentButton onClick={()=>setOpen(true)}>Publish as Artifact</AgentButton><AgentPromptDialog open={open} title="Publish a Skill Artifact" description="Give this prompt to the Agent developing your Skill project." defaultAgent={defaultAgent} installedAgents={installedAgents} promptFor={agent=>publishSkillPrompt(agent,channelId,channelName,parentRef)} onClose={()=>setOpen(false)} onError={onError}/></>;
}
