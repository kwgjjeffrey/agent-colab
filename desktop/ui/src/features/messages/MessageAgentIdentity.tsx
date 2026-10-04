import { useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { AgentIdentityCard } from "@/features/agent/AgentIdentityCard";
import { AgentAvatar } from "./AgentAvatar";
import type { Blueprint, AgentRequestStatus } from "./types";

export function MessageAgentIdentity({ agent, name, avatarUrl, requests, showWork }: {
  agent?: Blueprint; name: string; avatarUrl?: string;
  requests: AgentRequestStatus[]; showWork: (request: AgentRequestStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const tasks = agent ? requests.filter(request => request.targetBlueprintId === agent.id) : [];
  return <HoverCard open={open} onOpenChange={setOpen}>
    <HoverCardTrigger delay={200} closeDelay={150} render={<button type="button" aria-label={`About ${name}`} className="inline-flex shrink-0 items-center justify-center self-start rounded-full" onClick={() => setOpen(true)} />}>
      <AgentAvatar src={avatarUrl} name={agent?.ownerName ?? name} className="size-7" />
    </HoverCardTrigger>
    <HoverCardContent side="right" align="start" className="w-80 p-3">
      {agent ? <AgentIdentityCard name={agent.name} ownerName={agent.ownerName ?? "Unknown owner"} requests={tasks} showWork={request => { setOpen(false); showWork(request); }} /> : <div>{name}<p className="text-muted-foreground">This Agent is no longer in the Channel.</p></div>}
    </HoverCardContent>
  </HoverCard>;
}
