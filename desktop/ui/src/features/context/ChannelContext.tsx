import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { messageRequest } from "@/features/messages/api";
import { accountRealtime } from "@/api/realtime";
import { ForwardToAgentDialog } from "./ForwardToAgentDialog";
import { type ContextResource } from "./context-model";
import type {
  Blueprint,
  ChannelMessage,
  Participant,
} from "@/features/messages/types";

type Context = {
  channelId: string;
  resources: ContextResource[];
  people: Participant[];
  agents: Blueprint[];
  error?: string;
  navigate: (resource: ContextResource) => void;
  forward: (resources: ContextResource[], messageIds?: string[]) => void;
  refresh: (includeMessages?: boolean) => Promise<void>;
  lookup: (kind: ContextResource["kind"], id: string) => Promise<ContextResource | undefined>;
};
const ChannelContext = createContext<Context | null>(null);
export function useChannelContext() {
  return useContext(ChannelContext);
}
/** Identity is loaded on channel entry; resource choices are loaded only on demand. */
export function ChannelContextProvider({
  channelId,
  navigate,
  children,
}: {
  channelId: string;
  navigate: Context["navigate"];
  children: ReactNode;
}) {
  const [resources, setResources] = useState<ContextResource[]>([]),
    [people, setPeople] = useState<Participant[]>([]),
    [agents, setAgents] = useState<Blueprint[]>([]),
    [error, setError] = useState<string>(),
    [handoff, setHandoff] = useState<{
      resources: ContextResource[];
      messageIds: string[];
    }>();
  const active = useRef(false),
    inFlight = useRef<Map<string, Promise<void>>>(new Map());
  async function fetchPeople() {
    const participants = await messageRequest<Participant[]>(
      `/v1/channels/${channelId}/participants`, undefined, true,
    );
    const groups = await Promise.all(
      participants.map((person) =>
        messageRequest<Blueprint[]>(
          `/v1/channels/${channelId}/blueprints?ownerMemberId=${person.memberId}`,
          undefined,
          true,
        ),
      ),
    );
    if (!active.current) return;
    setPeople(participants);
    setAgents(groups.flat().filter((row) => row.inChannel));
  }
  async function fetchResources(includeMessages: boolean) {
    const [files, sessions, canvases, messages] =
      await Promise.all([
        messageRequest<
          Array<{
            id: string;
            name: string;
            contributorName: string;
            contributorMemberId?: string;
            updatedAt: string;
          }>
        >(`/v1/channels/${channelId}/files`, undefined, true),
        messageRequest<
          Array<{
            id: string;
            name: string;
            contributorName: string;
            contributorMemberId?: string;
            updatedAt: string;
          }>
        >(`/v1/channels/${channelId}/sessions`, undefined, true),
        messageRequest<
          Array<{
            id: string;
            title: string;
            createdByMemberId?: string;
            creatorName?: string;
            updatedAt: string;
          }>
        >(`/v1/channels/${channelId}/canvases`, undefined, true),
        includeMessages ? messageRequest<ChannelMessage[]>(
          `/v1/channels/${channelId}/messages?after=0&limit=200`,
          undefined,
          true,
        ) : Promise.resolve([]),
      ]);
    if (!active.current) return;
    const loaded: ContextResource[] = [
      ...files.map((row) => ({ ...row, channelId, kind: "files" as const })),
      ...sessions.map((row) => ({
        ...row,
        channelId,
        kind: "session" as const,
      })),
      ...canvases.map((row) => ({
        id: row.id,
        name: row.title,
        channelId,
        kind: "canvas" as const,
        contributorMemberId: row.createdByMemberId,
        contributorName: row.creatorName,
        updatedAt: row.updatedAt,
      })),
      ...messages.map((row) => ({
        id: row.id,
        name: `Message ${row.seq} · ${row.senderName}: ${row.body.slice(0, 60)}`,
        channelId,
        kind: "message" as const,
        seq: row.seq,
        contributorName: row.senderName,
        contributorMemberId: row.senderMemberId,
        updatedAt: row.createdAt,
        excerpt: row.body.slice(0, 240),
      })),
    ];
    setResources((previous) => includeMessages ? loaded : [
      ...loaded,
      ...previous.filter((row) => row.kind === "message"),
    ]);
    setError(undefined);
  }
  function refresh(includeMessages = false) {
    const key = includeMessages ? "with-messages" : "assets";
    const existing = inFlight.current.get(key);
    if (existing) return existing;
    const task = fetchResources(includeMessages).finally(() => {
      inFlight.current.delete(key);
    });
    inFlight.current.set(key, task);
    return task;
  }
  async function lookup(kind: ContextResource["kind"], id: string) {
    const cached = resources.find((row) => row.kind === kind && row.id === id);
    if (cached) return cached;
    const path = kind === "files" ? "files" : kind === "session" ? "sessions" : kind === "canvas" ? "canvases" : null;
    if (!path) return undefined;
    const rows = await messageRequest<Array<Record<string, string>>>(
      `/v1/channels/${channelId}/${path}`, undefined, true,
    );
    const row = rows.find((entry) => entry.id === id);
    if (!row) return undefined;
    return {
      id, kind, channelId,
      name: row.name ?? row.title ?? id,
      contributorName: row.contributorName ?? row.creatorName,
      contributorMemberId: row.contributorMemberId ?? row.createdByMemberId,
      updatedAt: row.updatedAt,
    };
  }
  useEffect(() => {
    active.current = true;
    let mounted = true;
    const reloadPeople = () => {
      if (mounted)
        void fetchPeople().catch((reason) => {
          if (mounted) setError(String(reason));
        });
    };
    reloadPeople();
    const off = accountRealtime.subscribe((frame) => {
      if (
        frame.type === "realtime.connected" ||
        (frame.channelId === channelId && frame.type.includes("agent"))
      )
        reloadPeople();
    });
    window.addEventListener("focus", reloadPeople);
    return () => {
      active.current = false;
      mounted = false;
      window.removeEventListener("focus", reloadPeople);
      off();
    };
  }, [channelId]);
  return (
    <ChannelContext.Provider
      value={{
        channelId,
        resources,
        people,
        agents,
        error,
        navigate,
        forward: (rows, ids = []) =>
          setHandoff({ resources: rows, messageIds: ids }),
        refresh,
        lookup,
      }}
    >
      {children}
      <ForwardToAgentDialog
        key={
          handoff
            ? handoff.resources.map((row) => row.id).join(":") +
              handoff.messageIds.join(":")
            : "closed"
        }
        open={Boolean(handoff)}
        agents={agents}
        contextLabel={
          handoff?.resources.map((row) => row.name).join(", ") ||
          `${handoff?.messageIds.length ?? 0} selected messages`
        }
        onClose={() => setHandoff(undefined)}
        onSend={async (agent, instruction) => {
          if (!handoff) return;
          await messageRequest(`/v1/channels/${channelId}/agent-requests`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              targetBlueprintId: agent.id,
              instruction,
              forwardedMessageIds: handoff.messageIds,
              contextRefs: handoff.resources.map(({ kind, id }) => ({
                kind,
                id,
              })),
            }),
          });
        }}
      />
    </ChannelContext.Provider>
  );
}
