import { useState } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AgentIdentityCard } from "@/features/agent/AgentIdentityCard";
import { AgentAvatar } from "./AgentAvatar";
import { Button } from "@/components/ui/button";
import type { Blueprint, Participant, AgentRequestStatus } from "./types";

export function AgentMemberItem({
  agent,
  owner,
  requests,
  showWork,
  onGive,
}: {
  agent: Blueprint;
  owner: Participant;
  requests: AgentRequestStatus[];
  showWork: (request: AgentRequestStatus) => void;
  onGive?: (agent: Blueprint) => void;
}) {
  const [open, setOpen] = useState(false);
  const tasks = requests.filter(
    (request) => request.targetBlueprintId === agent.id,
  );
  const working = tasks.some((request) => request.state === "running");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted",
              working && "agent-member-working",
            )}
          />
        }
      >
        <AgentAvatar
          src={agent.ownerAvatarUrl ?? owner.avatarUrl}
          name={owner.displayName}
        />
        <span className="min-w-0 flex-1 truncate text-sm">{agent.name}</span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            AI
          </Badge>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {working
              ? `Working… · ${tasks.length} tasks`
              : `${tasks.length} tasks`}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-80 p-3">
        <AgentIdentityCard
          name={agent.name}
          ownerName={agent.ownerName ?? owner.displayName}
          requests={tasks}
          showWork={(request) => {
            setOpen(false);
            showWork(request);
          }}
        >{onGive && <Button size="sm" className="mt-3 w-full px-4" onClick={() => { setOpen(false); onGive(agent); }}>Give Messages to Agent</Button>}</AgentIdentityCard>
      </PopoverContent>
    </Popover>
  );
}
