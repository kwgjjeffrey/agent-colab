import { useState } from "react";
import { AgentButton } from "@/features/agent/AgentButton";
import { AgentPromptDialog, agentSkillCommand, type AgentTarget } from "@/features/agent/AgentPromptDialog";
import { shellQuote } from "@/features/agent/ShareSetupPrompt";

export function channelIconPrompt(agent: AgentTarget, channel: { id: string; name: string }) {
  const browser = agentSkillCommand(agent, "colab-browser");
  // The GUI has already selected this identity; names can change or be duplicated.
  const ref = shellQuote(`colab://channel/${channel.id}`);
  return `Generate and set an icon for my Agent Colab Channel ${JSON.stringify(channel.name)}.

Use your image-generation capability to create one distinctive square icon inspired by the Channel name and my optional design request. It must remain legible at 32px and inside a circular crop: simple shapes, a cohesive palette, generous safe margins, no tiny text. If image generation is unavailable, explain that limitation instead of pretending an image was generated.

Save the actual generated image locally as PNG, JPEG, or WebP. Prepare a square 128–256px version no larger than 256 KiB; do not pass an image URL, a directory, or an SVG. Use a real absolute file path in place of <absolute-icon-path>, never execute that placeholder literally.

Read the selected Channel first and verify the name and owner/admin permission:
${browser} open --ref ${ref}

Upload and apply the image using the installed Agent Colab tool:
${browser} update-channel --channel ${ref} --icon-file '<absolute-icon-path>'

This command changes only the Channel icon. Do not rename the Channel, edit my account avatar, create a Files share, or change any members. If the account or Organization does not contain this exact Channel, stop and ask me to select the correct account rather than creating a replacement. If --icon-file is unavailable, update Agent Colab through its normal setup before retrying; do not bypass Local Core or use Server credentials.

Require a successful update receipt, then re-read the same Channel:
${browser} open --ref ${ref}

Report completion only after the tool confirms the update. Show me the generated image and explain any error; image generation alone is not a completed icon update.`;
}

export function ChannelIconPrompt({ channel, disabled, defaultAgent, installedAgents, onError }: {
  channel: { id: string; name: string }; disabled: boolean;
  defaultAgent: AgentTarget; installedAgents: Record<string, { installed: boolean }>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <AgentButton type="button" size="sm" disabled={disabled} onClick={() => setOpen(true)}>Generate icon via agent</AgentButton>
    <AgentPromptDialog open={open} title="Generate Channel icon" description="Your Agent generates an image and applies it to this Channel." defaultAgent={defaultAgent} installedAgents={installedAgents} promptFor={agent => channelIconPrompt(agent, channel)} onClose={() => setOpen(false)} onError={onError} />
  </>;
}
