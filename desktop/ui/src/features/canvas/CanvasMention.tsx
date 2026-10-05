import { traceTargets } from "@/api/trace-locators";
import { createContext, useContext, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { SparklesIcon } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { type AgentWorkRequest } from "@/features/agent/AgentWorkDrawer";
import { AgentIdentityCard } from "@/features/agent/AgentIdentityCard";
import type { Blueprint, Participant } from "@/features/messages/types";
import { ContextCapsule } from "@/features/context/ContextCapsule";
import { isResourceKind } from "@/features/context/context-model";
import { UserIdentityCard } from "@/features/context/UserIdentity";

type Request = AgentWorkRequest & {
  targetBlueprintId: string;
  sourceCanvasId?: string;
};
export const CanvasMentionContext = createContext<{
  canvasId: string;
  agents: Blueprint[];
  participants: Participant[];
  requests: Request[];
  prepareSend: (id: string, label: string, position: number) => Promise<void>;
  showWork: (request: Request) => void;
} | null>(null);

/** The editor atom owns only its trigger. shadcn owns the portal, hover bridge,
 * positioning and dismissal; execution state belongs to document+Agent. */
export function CanvasMention({ node, getPos }: NodeViewProps) {
  const context = useContext(CanvasMentionContext);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const id = String(node.attrs.id),
    kind = node.attrs.kind;
  const agent = context?.agents.find((value) => value.id === id);
  const person = context?.participants.find((value) => value.memberId === id);
  const label =
    agent?.name ?? person?.displayName ?? String(node.attrs.label ?? id);
  const requests =
    context?.requests.filter((value) => value.targetBlueprintId === id) ?? [];
  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      {isResourceKind(kind) ? (
        <ContextCapsule kind={kind} id={id} label={label} />
      ) : (
        <>
          <HoverCard open={open} onOpenChange={setOpen}>
            <HoverCardTrigger
              delay={150}
              closeDelay={150}
              render={
                <span
                  tabIndex={0}
                  role="button"
                  onClick={() => setOpen((value) => !value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setOpen((value) => !value);
                  }}
                  data-canvas-mention="true"
                  data-mention-id={id}
                  data-mention-kind={kind}
                  className={
                    kind === "member" ? `member-mention${person?.isCurrent ? " member-mention-me" : ""}` : "agent-mention"
                  }
                />
              }
            >
              @{label}
            </HoverCardTrigger>
            <HoverCardContent align="start" sideOffset={6} className="w-72 p-3">
              {kind !== "agent" ? (
                <UserIdentityCard id={id} name={label} />
              ) : (
                <AgentIdentityCard
                  name={label}
                  ownerName={agent?.ownerName ?? "Channel member"}
                  requests={requests}
                  showWork={(request) => context?.showWork(request as Request)}
                >
                  <Button data-trace-target={traceTargets("canvas.agent.prepare")}
                    className="mt-3 w-full px-4"
                    size="sm"
                    disabled={sending}
                    onClick={async () => {
                      const position = getPos();
                      if (!context || position == null) return;
                      setSending(true);
                      try {
                        await context.prepareSend(id, label, position);
                      } finally {
                        setSending(false);
                      }
                    }}
                  >
                    <SparklesIcon />
                    {sending ? "Preparing…" : "Send to Agent"}
                  </Button>
                </AgentIdentityCard>
              )}
            </HoverCardContent>
          </HoverCard>
        </>
      )}
    </NodeViewWrapper>
  );
}
