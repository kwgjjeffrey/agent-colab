import { useEffect, useState, type ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { AgentIdentityCard } from "@/features/agent/AgentIdentityCard";
import { AgentWorkDrawer } from "@/features/agent/AgentWorkDrawer";
import { messageRequest } from "@/features/messages/api";
import { accountRealtime } from "@/api/realtime";
import type { AgentRequestStatus } from "@/features/messages/types";
import { useChannelContext } from "./ChannelContext";
export function AgentIdentityLink({
  id,
  label,
  children,
}: {
  id?: string;
  label: string;
  children: ReactNode;
}) {
  const context = useChannelContext(),
    agent = context?.agents.find((row) => row.id === id);
  const [open, setOpen] = useState(false),
    [requests, setRequests] = useState<AgentRequestStatus[]>([]),
    [work, setWork] = useState<AgentRequestStatus>(),
    [error, setError] = useState<string>();
  useEffect(() => {
    if (!context || !open) return;
    let alive = true;
    const load = () => {
      void messageRequest<AgentRequestStatus[]>(
        `/v1/channels/${context.channelId}/agent-requests`,
        undefined,
        true,
      )
        .then((rows) => {
          if (alive) {
            setRequests(rows);
            setError(undefined);
          }
        })
        .catch((reason) => {
          if (alive) setError(String(reason));
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
  }, [context?.channelId, open]);
  return (
    <>
      <HoverCard open={open} onOpenChange={setOpen}>
        <HoverCardTrigger
          delay={150}
          closeDelay={150}
          render={
            <span
              role="button"
              tabIndex={0}
              className="inline-flex cursor-pointer"
              onClick={() => setOpen((value) => !value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setOpen((value) => !value);
              }}
            />
          }
        >
          {children}
        </HoverCardTrigger>
        <HoverCardContent className="w-80 p-4">
          <AgentIdentityCard
            name={agent?.name ?? label}
            ownerName={agent?.ownerName ?? "Unavailable"}
            requests={requests.filter((row) => row.targetBlueprintId === id)}
            showWork={(row) => {
              setOpen(false);
              setWork(row);
            }}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              Unable to load tasks.
            </p>
          )}
        </HoverCardContent>
      </HoverCard>
      <AgentWorkDrawer
        request={requests.find((row) => row.id === work?.id) ?? work}
        open={Boolean(work)}
        onOpenChange={(value) => {
          if (!value) setWork(undefined);
        }}
      />
    </>
  );
}
