import { traceTargets } from "@/api/trace-locators";
import { useAgentResultObservation } from "@/api/agent-result-observation";
import { runOperation } from "@/api/operation-runner";
import { operations } from "@/api/trace-operations";
import { beginOperation, type Operation } from "@/api/telemetry";
import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BotIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AgentPromptDialog,
  agentSkillCommand,
  type AgentTarget,
} from "@/features/agent/AgentPromptDialog";
import {
  AgentMessageComposer,
  type ComposedAgentMessage,
} from "./AgentMessageComposer";
import { messageRequest } from "./api";
import { ForwardToAgentDialog } from "@/features/context/ForwardToAgentDialog";
import { useChannelContext } from "@/features/context/ChannelContext";
import { messagesPrompt } from "@/features/context/context-model";
import { UserIdentity } from "@/features/context/UserIdentity";
import { accountRealtime } from "@/api/realtime";
import { MessageTimeline } from "./MessageTimeline";
import { MemberAvatar } from "./AgentAvatar";
import { AgentMemberItem } from "./AgentMemberItem";
import type {
  AgentRequestStatus,
  AgentRuntime,
  Blueprint,
  ChannelMessage,
  Participant,
} from "./types";
import { activeAgentNames, agentActivityLabel } from "./agent-activity";
import { AgentWorkDrawer } from "@/features/agent/AgentWorkDrawer";

type Props = {
  focusId?: string;
  channelId: string;
  channelName: string;
  settingsOpenToken: number;
  onSettingsOpenConsumed?: () => void;
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onActivityChange: (label?: string) => void;
};
type AgentRequest = { id: string; state: string };
type MessageCache = { rows: ChannelMessage[]; lastSeq: number };
const messageCache = new Map<string, MessageCache>();

/** WebSocket frames only wake this view; the ordered HTTP cursor is authoritative. */
export function MessagesView({
  focusId,
  channelId,
  channelName,
  settingsOpenToken,
  onSettingsOpenConsumed,
  defaultAgent,
  installedAgents,
  onError,
  onNotice,
  onActivityChange,
}: Props) {
  const context = useChannelContext();
  const [copyMessages, setCopyMessages] = useState<ChannelMessage[]>();
  const [giveAgent, setGiveAgent] = useState<Blueprint>();
  useEffect(() => { if (!focusId) return; void runOperation("messages.focus", async operation => operation.message<ChannelMessage>(`/v1/channels/${channelId}/messages/${focusId}`).then(row => setMessages(current => [...current.filter(value => value.id !== row.id), row].sort((a, b) => a.seq - b.seq)))).catch(reason => onError(String(reason))); }, [focusId, channelId]);
  const pendingPresentation = useRef(new Map<string, Operation>());
  useLayoutEffect(() => {
    for (const message of messages) {
      const operation = pendingPresentation.current.get(message.id);
      if (operation) {
        operation.finish("success");
        pendingPresentation.current.delete(message.id);
      }
    }
  });
  useEffect(
    () => () => {
      for (const operation of pendingPresentation.current.values())
        operation.finish("cancelled", "view.closed");
      pendingPresentation.current.clear();
    },
    [channelId],
  );
  const cached = messageCache.get(channelId);
  const [participants, setParticipants] = useState<Participant[]>([]),
    [messages, setMessages] = useState<ChannelMessage[]>(cached?.rows ?? []),
    [agents, setAgents] = useState<Record<string, Blueprint[]>>({}),
    [requests, setRequests] = useState<AgentRequestStatus[]>([]);
  useAgentResultObservation(requests);
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([]),
    [addOpen, setAddOpen] = useState(false),
    [agentsOpen, setAgentsOpen] = useState(false),
    [managerOwnerId, setManagerOwnerId] = useState<string>(),
    [focused, setFocused] = useState<Blueprint>(),
    [draft, setDraft] = useState(false),
    [promptOpen, setPromptOpen] = useState(false);
  const [sending, setSending] = useState(false),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [selectionMode, setSelectionMode] = useState(false),
    [forwardOpen, setForwardOpen] = useState(false),
    [replyingTo, setReplyingTo] = useState<ChannelMessage>(),
    [workRequest, setWorkRequest] = useState<AgentRequestStatus>();
  const lastSeqRef = useRef(cached?.lastSeq ?? 0),
    catchUpRef = useRef<Promise<void> | undefined>(undefined),
    catchUpQueuedRef = useRef(false),
    managerMode = useRef<"channel" | "settings">("channel");
  async function loadParticipants() {
return runOperation("messages.participants", async (operation) => {
const messageRequest = operation.message;

    const rows = await messageRequest<Participant[]>(
      `/v1/channels/${channelId}/participants`,
    );
    setParticipants(rows);
    return rows;

});
}
  async function loadMessages(after = 0, background = false) {
return runOperation("messages.list", async (operation) => {
const messageRequest = operation.message;

    const rows = await messageRequest<ChannelMessage[]>(
      `/v1/channels/${channelId}/messages?after=${after}&limit=200`,
      undefined,
      background,
    );
    setMessages((current) => {
      const next =
        after === 0
          ? rows
          : [
              ...current,
              ...rows.filter(
                (row) => !current.some((item) => item.id === row.id),
              ),
            ];
      lastSeqRef.current = next.at(-1)?.seq ?? 0;
      messageCache.set(channelId, { rows: next, lastSeq: lastSeqRef.current });
      return next;
    });

});
}
  async function loadAgents(memberId: string) {
return runOperation("agents.list", async (operation) => {
const messageRequest = operation.message;

    const rows = await messageRequest<Blueprint[]>(
      `/v1/channels/${channelId}/blueprints?ownerMemberId=${memberId}`,
    );
    setAgents((current) => ({ ...current, [memberId]: rows }));
    return rows;

});
}
  async function loadRuntimes() {
return runOperation("agents.runtimes", async (operation) => {
const messageRequest = operation.message;

    setRuntimes(
      await messageRequest(`/v1/channels/${channelId}/agent-runtimes`),
    );

});
}
  async function loadRequests() {
return runOperation("agents.requests", async (operation) => {
const messageRequest = operation.message;

    setRequests(
      await messageRequest<AgentRequestStatus[]>(
        `/v1/channels/${channelId}/agent-requests`,
        undefined,
        true,
      ),
    );

});
}
  useEffect(() => {
    const label = agentActivityLabel(activeAgentNames(requests));
    onActivityChange(label || undefined);
    return () => onActivityChange(undefined);
  }, [requests, onActivityChange]);
  useEffect(() => {
    const cached = messageCache.get(channelId);
    lastSeqRef.current = cached?.lastSeq ?? 0;
    setMessages(cached?.rows ?? []);
    setReplyingTo(undefined);
    setAgents({});
    setRequests([]);
    void Promise.all([
      loadParticipants().then((rows) =>
        Promise.all(rows.map((row) => loadAgents(row.memberId))),
      ),
      loadMessages(cached?.lastSeq ?? 0, Boolean(cached)),
      loadRuntimes(),
      loadRequests(),
    ]).catch((reason) => onError(String(reason)));
  }, [channelId]);
  useEffect(() => {
    let stopped = false;
    const catchUp = () => {
      catchUpQueuedRef.current = true;
      if (catchUpRef.current) return catchUpRef.current;
      const pending = (async () => {
        while (catchUpQueuedRef.current && !stopped) {
          catchUpQueuedRef.current = false;
          try {
            await Promise.all([
              loadMessages(lastSeqRef.current, true),
              loadRequests(),
            ]);
          } catch {
            /* next heartbeat, focus, or reconnect retries authoritative state */
          }
        }
      })().finally(() => {
        if (catchUpRef.current === pending) catchUpRef.current = undefined;
      });
      catchUpRef.current = pending;
      return pending;
    };
    const unsubscribe = accountRealtime.subscribe((data) => {
      if (
        data.type === "heartbeat" ||
        data.type === "realtime.connected" ||
        (data.channelId === channelId &&
          (data.type === "messages.invalidated" ||
            data.type === "agent_requests.invalidated"))
      )
        void catchUp();
    });
    const visible = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      catchUpQueuedRef.current = false;
      unsubscribe();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [channelId]);
  const me = participants.find((person) => person.isCurrent),
    sortedParticipants = useMemo(
      () =>
        [...participants].sort(
          (left, right) => Number(right.isCurrent) - Number(left.isCurrent),
        ),
      [participants],
    ),
    channelAgents = useMemo(
      () =>
        Object.values(agents)
          .flat()
          .filter((agent) => agent.inChannel),
      [agents],
    ),
    selectedAgents = managerOwnerId ? (agents[managerOwnerId] ?? []) : [],
    managingOwn = managerOwnerId === me?.memberId;
  useEffect(() => {
    if (settingsOpenToken > 0 && me) {
      onSettingsOpenConsumed?.();
      void openManager("settings", me).catch((reason) =>
        onError(String(reason)),
      );
    }
  }, [settingsOpenToken, me?.memberId]);

  async function send(composed: ComposedAgentMessage) {

    const operation = beginOperation(operations["messages.send"]);
    setSending(true);
    try {
      const created = await messageRequest<ChannelMessage>(
        `/v1/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...composed,
            replyToMessageId: replyingTo?.id,
            clientNonce: crypto.randomUUID(),
          }),
        },
        false,
        operation,
      );
      pendingPresentation.current.set(created.id, operation);
      setMessages((current) => {
        const next = current.some((item) => item.id === created.id)
          ? current
          : [...current, created];
        lastSeqRef.current = next.at(-1)?.seq ?? lastSeqRef.current;
        messageCache.set(channelId, {
          rows: next,
          lastSeq: lastSeqRef.current,
        });
        return next;
      });
      setReplyingTo(undefined);
      await loadRequests();
    } catch (reason) {
      operation.finish("error", "result.failed");
      onError(String(reason));
      throw reason;
    } finally {
      setSending(false);
    }

}
  async function createRequest(
    agent: Blueprint,
    source: { forwardedMessageIds: string[]; instruction: string },
  ) {
return runOperation("agents.forward", async (operation) => {
const messageRequest = operation.message;

    return messageRequest<AgentRequest>(
      `/v1/channels/${channelId}/agent-requests`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetBlueprintId: agent.id, ...source }),
      },
    );

});
}
  async function forward(agent: Blueprint, instruction: string) {
    try {
      const request = await createRequest(agent, {
        forwardedMessageIds: [...selected],
        instruction,
      });
      onNotice(
        request.state === "queued"
          ? `Task sent to ${agent.name}.`
          : `Request is ${request.state.replace("_", " ")}.`,
      );
      setSelected(new Set());
      setForwardOpen(false);
    } catch (reason) {
      onError(String(reason));
      throw reason;
    }
  }
  async function addUser(event: FormEvent<HTMLFormElement>) {
return runOperation("messages.member.add", async (operation) => {
const messageRequest = operation.message;

    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await messageRequest(`/v1/channels/${channelId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), role: "member" }),
      });
      await loadParticipants();
      setAddOpen(false);
      onNotice("User added or invitation queued.");
    } catch (reason) { operation.fail();
      onError(String(reason));
    }

});
}
  async function openManager(mode: "channel" | "settings", owner = me) {
return runOperation("agents.manager", async (operation) => {


    if (!owner) return;
    managerMode.current = mode;
    const rows = await loadAgents(owner.memberId);
    setManagerOwnerId(owner.memberId);
    setFocused(rows[0]);
    setDraft(false);
    setAgentsOpen(true);

});
}
  async function saveBlueprint(event: FormEvent<HTMLFormElement>) {
return runOperation("agents.save", async (operation) => {
const messageRequest = operation.message;

    event.preventDefault();
    const data = new FormData(event.currentTarget),
      runtimeId = String(data.get("runtimeId") ?? ""),
      runtime = runtimes.find((item) => item.id === runtimeId);
    if (!runtime) {
      onError("Choose a connected Agent runtime.");
      return;
    }
    const payload = {
      name: data.get("name"),
      loadingInstruction: data.get("loadingInstruction"),
      loadingCommand: data.get("loadingCommand"),
      runtimeId,
      runtimeDevice: runtime.deviceName,
      runtimeAgent: runtime.provider,
      invocationPolicy: data.get("invocationPolicy"),
    };
    try {
      const updated = await messageRequest<Blueprint>(
        focused
          ? `/v1/channels/${channelId}/blueprints/${focused.id}`
          : `/v1/channels/${channelId}/blueprints`,
        {
          method: focused ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!focused)
        await messageRequest(
          `/v1/channels/${channelId}/blueprints/${updated.id}/selection`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          },
        );
      setDraft(false);
      setFocused(updated);
      await Promise.all([
        loadAgents(updated.ownerMemberId),
        loadParticipants(),
      ]);
      onNotice(
        focused
          ? "Agent configuration saved."
          : "Agent created and added to this Channel.",
      );
    } catch (reason) { operation.fail();
      onError(String(reason));
    }

});
}
  async function setInChannel(item: Blueprint, enabled: boolean) {
return runOperation("agents.select", async (operation) => {
const messageRequest = operation.message;

    try {
      await messageRequest(
        `/v1/channels/${channelId}/blueprints/${item.id}/selection`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
      );
      await Promise.all([loadAgents(item.ownerMemberId), loadParticipants()]);
      setFocused((current) =>
        current?.id === item.id ? { ...current, inChannel: enabled } : current,
      );
    } catch (reason) { operation.fail();
      onError(String(reason));
    }

});
}
  async function removeAgent() {
return runOperation("agents.remove", async (operation) => {
const messageRequest = operation.message;

    if (!focused) return;
    try {
      await messageRequest(
        `/v1/channels/${channelId}/blueprints/${focused.id}`,
        { method: "DELETE" },
      );
      const rows = await loadAgents(focused.ownerMemberId);
      setFocused(rows[0]);
      await loadParticipants();
      onNotice("Agent removed.");
    } catch (reason) { operation.fail();
      onError(String(reason));
    }

});
}
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_20rem] overflow-hidden">
      <section data-trace-target={traceTargets("messages.list", "messages.focus")} className="flex min-h-0 min-w-0 flex-col">
        <MessageTimeline
          focusId={focusId}
          channelId={channelId}
          messages={messages}
          currentMemberId={me?.memberId}
          currentUserName={me?.displayName}
          agents={channelAgents}
          requests={requests}
          showWork={setWorkRequest}
          selected={selected}
          selectionMode={selectionMode}
          onSelected={(id, value) =>
            setSelected((current) => {
              const next = new Set(current);
              value ? next.add(id) : next.delete(id);
              return next;
            })
          }
          onReply={setReplyingTo}
          onCopy={(message) => setCopyMessages([message])}
          onForward={(message) => {
            setSelected(new Set([message.id]));
            setForwardOpen(true);
          }}
          onStartSelection={(message) => {
            setSelectionMode(true);
            setSelected(new Set([message.id]));
          }}
        />
        {selectionMode && (
          <div className="flex shrink-0 items-center justify-center gap-3 border-t bg-muted/40 p-2 text-sm">
            <strong>{selected.size} selected</strong>
            <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => setCopyMessages(messages.filter(row => selected.has(row.id)))}>Copy to use in my agent</Button>
            <Button data-trace-target={traceTargets("agents.forward")}
              size="sm"
              disabled={!selected.size}
              onClick={() => setForwardOpen(true)}
            >
              Forward to Agent
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelected(new Set());
                setSelectionMode(false);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
        <AgentMessageComposer
          channelName={channelName}
          agents={channelAgents}
          participants={participants}
          busy={sending}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(undefined)}
          onSubmit={send}
        />
      </section>
      <aside data-trace-target={traceTargets("messages.participants", "agents.list", "agents.requests")} data-trace-region={"participants"} className="min-h-0 overflow-y-auto border-l bg-muted/20 px-3 py-3">
        <Button data-trace-target={traceTargets("messages.member.add")}
          className="mb-3 w-full"
          variant="outline"
          onClick={() => setAddOpen(true)}
        >
          <UsersIcon />
          Add user
        </Button>
        <div className="flex flex-col gap-0.5">
          {sortedParticipants.flatMap((person) => [
            <div
              key={`member:${person.memberId}`}
              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <UserIdentity id={person.memberId} name={person.displayName} onGive={setGiveAgent} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                <MemberAvatar
                  src={person.avatarUrl}
                  name={person.displayName}
                />
                <span className="min-w-0 truncate text-sm font-medium">
                  {person.displayName}{person.isCurrent && " (me)"}
                </span>
              </UserIdentity>
              {person.isCurrent && (
                <Button data-trace-nav={"agents.manager"} data-trace-target={traceTargets("agents.manager", "agents.runtimes")}
                  size="sm"
                  variant="ghost"
                  onClick={() => void openManager("channel", person)}
                >
                  {person.agentCount} Agents
                </Button>
              )}
            </div>,
            ...(agents[person.memberId] ?? [])
              .filter((item) => item.inChannel)
              .map((item) => (
                <AgentMemberItem
                  key={`agent:${item.id}`}
                  agent={item}
                  owner={person}
                  requests={requests}
                  showWork={setWorkRequest}
                  onGive={setGiveAgent}
                />
              )),
          ])}
        </div>
      </aside>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form data-trace-target={traceTargets("messages.member.add")} onSubmit={addUser}>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Add an Organization member or invite an email address.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-5">
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input name="email" type="email" required autoFocus />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Add user</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={agentsOpen} onOpenChange={setAgentsOpen}>
        <DialogContent data-trace-region={"agents-manager"} className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Agents</DialogTitle>
            <DialogDescription>
              {managingOwn
                ? "Choose Agents for this Channel and bind each one to a connected runtime."
                : "Agents this member brought into the Channel."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-[30rem] grid-cols-[17rem_minmax(0,1fr)] overflow-hidden rounded-lg border">
            <aside className="border-r p-3">
              {managingOwn && (
                <>
                  <Button
                    className="mb-2 w-full"
                    onClick={() => setPromptOpen(true)}
                  >
                    <BotIcon />
                    Create by my agent
                  </Button>
                  <Button
                    variant="outline"
                    className="mb-3 w-full"
                    onClick={() => {
                      setDraft(true);
                      setFocused(undefined);
                    }}
                  >
                    <PlusIcon />
                    Create manually
                  </Button>
                </>
              )}
              {selectedAgents.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md p-1 hover:bg-muted"
                >
                  {managerMode.current === "channel" && managingOwn && (
                    <Checkbox data-trace-target={traceTargets("agents.select")}
                      checked={item.inChannel}
                      onCheckedChange={(value) =>
                        void setInChannel(item, value === true)
                      }
                    />
                  )}
                  <button
                    className="min-w-0 flex-1 truncate p-2 text-left text-sm"
                    onClick={() => {
                      setDraft(false);
                      setFocused(item);
                    }}
                  >
                    {item.name}
                  </button>
                </div>
              ))}
            </aside>
            <section className="min-w-0 p-5">
              {focused || draft ? (
                <BlueprintForm
                  blueprint={focused}
                  runtimes={runtimes}
                  onSubmit={saveBlueprint}
                  onRemove={removeAgent}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  Select an Agent.
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
      <ForwardToAgentDialog
        key={forwardOpen ? [...selected].join(":") : "closed"}
        open={forwardOpen}
        agents={channelAgents}
        contextLabel={`${selected.size} selected messages`}
        onClose={() => setForwardOpen(false)}
        onSend={forward}
      />
      <AgentPromptDialog
        open={Boolean(giveAgent)}
        title={`Give Messages to ${giveAgent?.name ?? "Agent"}`}
        description="Use recent Channel messages as context. Add your instruction below."
        defaultAgent={defaultAgent}
        installedAgents={installedAgents}
        promptFor={(agent) => messagesPrompt(messages.slice(-10), context?.resources ?? [], agent)}
        onSend={async (query) => {
          if (!giveAgent) return;
          const recent = messages.slice(-10);
          if (!recent.length) throw new Error("There are no messages to send as context yet.");
          const request = await createRequest(giveAgent, { forwardedMessageIds: recent.map(row => row.id), instruction: query });
          onNotice(request.state === "queued" ? `Task sent to ${giveAgent.name}.` : `Request is ${request.state.replace("_", " ")}.`);
          await loadRequests();
        }}
        onClose={() => setGiveAgent(undefined)}
        onError={onError}
      />
      <AgentPromptDialog
        open={Boolean(copyMessages)}
        title="Copy to use in my agent"
        description="Copy this conversation context and add your task in your Agent."
        defaultAgent={defaultAgent}
        installedAgents={installedAgents}
        promptFor={(agent) =>
          messagesPrompt(copyMessages ?? [], context?.resources ?? [], agent)
        }
        onClose={() => setCopyMessages(undefined)}
        onError={onError}
        onForward={() => {
          setSelected(new Set(copyMessages?.map((row) => row.id)));
          setCopyMessages(undefined);
          setForwardOpen(true);
        }}
      />
      <AgentPromptDialog
        open={promptOpen}
        title="Create Agent"
        description="The prompt includes registered Codex runtime IDs available on your devices."
        defaultAgent={defaultAgent}
        installedAgents={installedAgents}
        onClose={() => setPromptOpen(false)}
        onError={onError}
        promptFor={(agent) =>
          `Create an Agent Colab blueprint for Channel ${JSON.stringify(channelName)}. Available registered Codex runtimes:\n${
            runtimes
              .filter(
                (runtime) => runtime.available && runtime.provider === "codex",
              )
              .map(
                (runtime) => `- ${runtime.id}: ${runtime.deviceName} · Codex`,
              )
              .join("\n") || "- None"
          }\n\nUse ${agentSkillCommand(agent, "colab-messages")} blueprint upsert --channel ${JSON.stringify(channelName)} --name <name> --runtime <runtime-id>. Missing or unregistered runtime IDs must fail.`
        }
      />
      <AgentWorkDrawer
        request={
          requests.find((request) => request.id === workRequest?.id) ??
          workRequest
        }
        open={Boolean(workRequest)}
        onOpenChange={(open) => {
          if (!open) setWorkRequest(undefined);
        }}
      />
    </div>
  );
}

function BlueprintForm({
  blueprint,
  runtimes,
  onSubmit,
  onRemove,
}: {
  blueprint?: Blueprint;
  runtimes: AgentRuntime[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}) {
  const editable = blueprint?.editable ?? true,
    available = runtimes.filter(
      (runtime) => runtime.available && runtime.provider === "codex",
    );
  return (
    <form data-trace-target={traceTargets("agents.save")} onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            name="name"
            defaultValue={blueprint?.name ?? ""}
            required
            readOnly={!editable}
          />
        </Field>
        <Field>
          <FieldLabel>Loading instruction</FieldLabel>
          <Input
            name="loadingInstruction"
            defaultValue={blueprint?.loadingInstruction ?? ""}
            readOnly={!editable}
          />
        </Field>
        <Field>
          <FieldLabel>Loading command</FieldLabel>
          <Input
            name="loadingCommand"
            defaultValue={blueprint?.loadingCommand ?? ""}
            readOnly={!editable}
          />
        </Field>
        <Field>
          <FieldLabel>Agent runtime</FieldLabel>
          <Select
            name="runtimeId"
            defaultValue={blueprint?.runtimeId}
            disabled={!editable}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a connected runtime" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {available.map((runtime) => (
                  <SelectItem key={runtime.id} value={runtime.id}>
                    {runtime.deviceName} · Codex
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {!available.length && (
            <p className="text-sm text-destructive">
              Install Agent Colab Skill for Codex on a device first.
            </p>
          )}
        </Field>
        <Field>
          <FieldLabel>Upon request by others</FieldLabel>
          <Select
            name="invocationPolicy"
            defaultValue={blueprint?.invocationPolicy ?? "awaiting_owner"}
            disabled={!editable}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="refuse">Refuse</SelectItem>
                <SelectItem value="awaiting_owner">Ask me first</SelectItem>
                <SelectItem value="process">Process</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {editable && (
          <div className="flex justify-between">
            {blueprint ? (
              <Button data-trace-target={traceTargets("agents.remove")} type="button" variant="destructive" onClick={onRemove}>
                <Trash2Icon />
                Remove Agent
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={!available.length}>
              {blueprint ? "Save" : "Create and add"}
            </Button>
          </div>
        )}
      </FieldGroup>
    </form>
  );
}
