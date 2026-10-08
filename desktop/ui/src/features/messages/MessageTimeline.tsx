import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CopyIcon, ForwardIcon, ListIcon, QuoteIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MentionCapsule } from "@/features/context/MentionCapsule";
import { UserIdentity } from "@/features/context/UserIdentity";
import { AgentIdentityLink } from "@/features/context/AgentIdentityLink";
import type { Blueprint, ChannelMessage, AgentRequestStatus } from "./types";
import { MemberAvatar } from "./AgentAvatar";
import { MessageAgentIdentity } from "./MessageAgentIdentity";

export function MessageTimeline({
  focusId,
  channelId,
  messages,
  currentMemberId,
  currentUserName,
  agents,
  requests,
  showWork,
  selected,
  selectionMode,
  onSelected,
  onReply,
  onForward,
  onCopy,
  onStartSelection,
  onAddAgent,
}: {
  onAddAgent?: () => void;
  focusId?: string;
  channelId: string;
  messages: ChannelMessage[];
  currentMemberId?: string;
  currentUserName?: string;
  agents: Blueprint[];
  requests: AgentRequestStatus[];
  showWork: (request: AgentRequestStatus) => void;
  selected: Set<string>;
  selectionMode: boolean;
  onSelected: (id: string, value: boolean) => void;
  onReply: (message: ChannelMessage) => void;
  onForward: (message: ChannelMessage) => void;
  onCopy?: (message: ChannelMessage) => void;
  onStartSelection: (message: ChannelMessage) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    restored = useRef(false),
    atBottom = useRef(true);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || restored.current) return;
    const saved = sessionStorage.getItem(
      `agent-colab:messages-scroll:${channelId}`,
    );
    element.scrollTop = saved === null ? element.scrollHeight : Number(saved);
    atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    restored.current = true;
  }, [channelId, messages.length]);
  useLayoutEffect(() => {
    restored.current = false;
  }, [channelId]);
  useLayoutEffect(() => {
    if (viewport.current && atBottom.current && !focusId) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [messages.length, focusId]);
  useLayoutEffect(() => {
    if (focusId)
      document
        .getElementById(`message-${focusId}`)
        ?.scrollIntoView({ block: "center" });
  }, [focusId, messages]);
  const owners = new Map(agents.map((agent) => [agent.name, agent.ownerName])),
    messageById = new Map(messages.map((message) => [message.id, message]));
  return (
    <div
      ref={viewport}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) => {
        const element = event.currentTarget;
        atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        sessionStorage.setItem(
          `agent-colab:messages-scroll:${channelId}`,
          String(event.currentTarget.scrollTop),
        );
      }}
    >
      <div className="flex min-h-full flex-col justify-end py-3">
        <div className="mx-auto w-full max-w-2xl px-6 py-8 text-sm">
          <h2 className="mb-4 text-lg font-semibold">Work together with your Agents</h2>
          <div className="divide-y">
            <div className="flex items-center justify-between gap-4 py-3"><div><strong>Add your Agent counterpart</strong><p className="mt-1 text-muted-foreground">Teammates can @mention your Agent to ask for help, even while you work on something else.</p></div>{onAddAgent && <Button variant="outline" size="sm" onClick={onAddAgent}>Add my Agent</Button>}</div>
            <div className="py-3"><strong>Bring the right person into the discussion</strong><p className="mt-1 text-muted-foreground">Type @ in the composer to mention a teammate or their Agent and explain what you need.</p></div>
            <div className="py-3"><strong>Turn a decision into action</strong><p className="mt-1 text-muted-foreground">Once you agree on a plan, @mention an Agent to carry it out. Quote a message or forward selected messages to give it the discussion context.</p></div>
          </div>
        </div>
        {messages.map((message) => {
          const agent = message.senderKind === "agent",
            mine = !agent && message.senderName === currentUserName,
            owner = owners.get(message.senderName),
            displayName = agent
              ? `${message.senderName}${owner ? ` (${owner}'s Agent)` : ""}`
              : message.senderName;
          return (
            <div
              key={message.id}
              id={`message-${message.id}`}
              className="group/message flex items-start gap-3 px-4 py-2 hover:bg-muted/40"
            >
              {selectionMode && (
                <Checkbox
                  className="mt-1.5"
                  checked={selected.has(message.id)}
                  onCheckedChange={(value) =>
                    onSelected(message.id, value === true)
                  }
                  aria-label={`Select message from ${displayName}`}
                />
              )}
              {agent ? (
                <MessageAgentIdentity
                  agent={
                    message.senderBlueprintId
                      ? agents.find(
                          (row) => row.id === message.senderBlueprintId,
                        )
                      : agents.filter(
                            (candidate) =>
                              candidate.name === message.senderName,
                          ).length === 1
                        ? agents.find(
                            (candidate) =>
                              candidate.name === message.senderName,
                          )
                        : undefined
                  }
                  name={message.senderName}
                  avatarUrl={message.senderAvatarUrl}
                  requests={requests}
                  showWork={showWork}
                />
              ) : (
                <UserIdentity
                  id={message.senderMemberId}
                  name={message.senderName}
                >
                  <MemberAvatar
                    src={message.senderAvatarUrl}
                    name={message.senderName}
                    className="size-7"
                  />
                </UserIdentity>
              )}
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex min-h-6 items-center gap-2 text-sm">
                  {agent ? (
                    <AgentIdentityLink
                      id={message.senderBlueprintId}
                      label={message.senderName}
                    >
                      <strong>{displayName}</strong>
                    </AgentIdentityLink>
                  ) : (
                    <UserIdentity
                      id={message.senderMemberId}
                      name={message.senderName}
                    >
                      <strong>{displayName}</strong>
                    </UserIdentity>
                  )}
                  {agent && (
                    <Badge
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px]"
                    >
                      AI
                    </Badge>
                  )}
                  <time className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
                    {new Date(message.createdAt).toLocaleString()}
                  </time>
                  {!selectionMode && (
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Quote"
                              aria-label={`Quote ${displayName}`}
                              onClick={() => onReply(message)}
                            />
                          }
                        >
                          <QuoteIcon />
                        </TooltipTrigger>
                        <TooltipContent>Quote</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Forward"
                              aria-label={`Forward ${displayName}`}
                              onClick={() => onForward(message)}
                            />
                          }
                        >
                          <ForwardIcon />
                        </TooltipTrigger>
                        <TooltipContent>Forward to Agent</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Copy to use in my agent"
                              onClick={() => onCopy?.(message)}
                            />
                          }
                        >
                          <CopyIcon />
                        </TooltipTrigger>
                        <TooltipContent>Copy to use in my agent</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Select messages"
                              aria-label="Enter message selection"
                              onClick={() => onStartSelection(message)}
                            />
                          }
                        >
                          <ListIcon />
                        </TooltipTrigger>
                        <TooltipContent>Select messages</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
                <div className="text-sm leading-6">
                  {message.replyToMessageId && (
                    <ReplyReference
                      message={messageById.get(message.replyToMessageId)}
                    />
                  )}
                  <p className="whitespace-pre-wrap break-words">
                    {renderNodes(
                      message.content,
                      message.body,
                      currentMemberId,
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function ReplyReference({ message }: { message?: ChannelMessage }) {
  return (
    <div className="mb-1 max-w-full truncate border-l-2 border-border pl-2 text-xs text-muted-foreground">
      {message
        ? `${message.senderName}: ${message.body}`
        : "Referenced message"}
    </div>
  );
}
function renderNodes(
  node: ChannelMessage["content"] | undefined,
  fallback: string,
  currentMemberId?: string,
): ReactNode {
  if (!node?.content?.length) return fallback;
  return node.content.map((item, index) =>
    item.type === "text" ? (
      item.text
    ) : item.type === "mention" ? (
      <span key={index} className="mx-1">
        <MentionCapsule
          kind={item.attrs?.kind}
          id={item.attrs?.id}
          label={item.attrs?.label ?? "Context"}
          currentMemberId={currentMemberId}
        />
      </span>
    ) : item.type === "hardBreak" ? (
      <br key={index} />
    ) : (
      <span key={index}>{renderNodes(item, "", currentMemberId)}</span>
    ),
  );
}
export function mentionClass(
  kind: string | undefined,
  id: string | undefined,
  currentMemberId: string | undefined,
) {
  return kind === "member"
    ? id === currentMemberId
      ? "member-mention member-mention-me mx-1"
      : "member-mention mx-1"
    : "agent-mention mx-1";
}
