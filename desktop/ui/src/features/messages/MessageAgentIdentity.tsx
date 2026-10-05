import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AgentIdentityCard } from "@/features/agent/AgentIdentityCard";
import { AgentAvatar } from "./AgentAvatar";
import type { Blueprint, AgentRequestStatus } from "./types";

export function MessageAgentIdentity({ agent, name, avatarUrl, requests, showWork }: {
  agent?: Blueprint; name: string; avatarUrl?: string;
  requests: AgentRequestStatus[]; showWork: (request: AgentRequestStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const tasks = agent ? requests.filter(request => request.targetBlueprintId === agent.id) : [];
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<button type="button" aria-label={`About ${name}`} className="inline-flex shrink-0 items-center justify-center self-start rounded-full" />}>
      <AgentAvatar src={avatarUrl} name={agent?.ownerName ?? name} className="size-7" />
    </PopoverTrigger>
    <PopoverContent side="right" align="start" className="w-80 p-3">
      {agent ? <AgentIdentityCard name={agent.name} ownerName={agent.ownerName ?? "Unknown owner"} requests={tasks} showWork={request => { setOpen(false); showWork(request); }} /> : <div>{name}<p className="text-muted-foreground">This Agent is no longer in the Channel.</p></div>}
    </PopoverContent>
  </Popover>;
}
