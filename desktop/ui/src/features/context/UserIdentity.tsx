import { traceTargets } from "@/api/trace-locators";
import { runOperation } from "@/api/operation-runner";
import { useEffect, useState, type ReactNode } from "react";
import { accountRealtime } from "@/api/realtime";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AgentMemberItem } from "@/features/messages/AgentMemberItem";
import { AgentWorkDrawer } from "@/features/agent/AgentWorkDrawer";
import { messageRequest } from "@/features/messages/api";
import type { AgentRequestStatus } from "@/features/messages/types";
import { useChannelContext } from "./ChannelContext";
import { ContextCapsule } from "./ContextCapsule";
import type { Blueprint } from "@/features/messages/types";
export function UserIdentityCard({ id, name, onGive }: { id?: string; name: string; onGive?: (agent: Blueprint) => void }) {
  const context = useChannelContext(),
    person = context?.people.find((row) => row.memberId === id);
  const [requests, setRequests] = useState<AgentRequestStatus[]>([]),
    [work, setWork] = useState<AgentRequestStatus>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!context) return;
    let alive = true;
    const load = () => {
      void runOperation("members.identity.requests", async (operation) => {
        try { const rows=await operation.message<AgentRequestStatus[]>(`/v1/channels/${context.channelId}/agent-requests`); if (alive) {setRequests(rows);setError(undefined);} else operation.cancel(); }
        catch(reason) {operation.fail(); if(alive)setError(String(reason));}
      });
    };
    load();
    const off = accountRealtime.subscribe((frame) => {
      if (frame.channelId === context.channelId && frame.type.includes("agent"))
        load();
    });
    return () => {
      alive = false;
      off();
    };
  }, [context?.channelId]);
  const agents =
      (id ? context?.agents.filter((row) => row.ownerMemberId === id) : []) ??
      [],
    assets =
      context?.resources.filter(
        (row) =>
          Boolean(id) &&
          row.contributorMemberId === id &&
          row.kind !== "message",
      ) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <strong>{person?.displayName ?? name}</strong>
        <p className="text-sm text-muted-foreground">
          {person?.email ?? "Channel member"}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Unable to load tasks.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Agents in this Channel</p>
        {agents.map((agent) => (
          <AgentMemberItem
            key={agent.id}
            agent={agent}
            owner={
              person ?? {
                memberId: id ?? "",
                displayName: name,
                email: "",
                isCurrent: false,
                agentCount: agents.length,
              }
            }
            requests={requests}
            showWork={setWork}
            onGive={onGive}
          />
        ))}
        {!agents.length && (
          <p className="text-sm text-muted-foreground">No Agent shared here.</p>
        )}
      </div>
      <div className="flex max-h-48 flex-col items-start gap-1 overflow-y-auto">
        <p className="text-xs text-muted-foreground">Shared assets</p>
        {assets.map((row) => (
          <ContextCapsule
            key={`${row.kind}:${row.id}`}
            kind={row.kind}
            id={row.id}
            label={row.name}
          />
        ))}
        {!assets.length && (
          <p className="text-sm text-muted-foreground">
            No shared assets in this Channel.
          </p>
        )}
      </div>
      <AgentWorkDrawer
        request={requests.find((row) => row.id === work?.id) ?? work}
        open={Boolean(work)}
        onOpenChange={(open) => {
          if (!open) setWork(undefined);
        }}
      />
    </div>
  );
}
export function UserIdentity({
  id,
  name,
  children,
  className,
  onGive,
}: {
  id?: string;
  name: string;
  children: ReactNode;
  className?: string;
  onGive?: (agent: Blueprint) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger data-trace-target={traceTargets("members.identity.requests")}
        render={
          <span data-trace-target={traceTargets("members.identity.requests")} role="button" tabIndex={0} className={className ?? "inline-flex cursor-pointer text-left"} onClick={(event) => event.stopPropagation()} />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4">
        <UserIdentityCard id={id} name={name} onGive={onGive} />
      </PopoverContent>
    </Popover>
  );
}
