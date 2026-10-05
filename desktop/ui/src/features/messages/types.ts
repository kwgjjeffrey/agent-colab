export type Participant = {
  memberId: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  isCurrent: boolean;
  agentCount: number;
};
export type AgentRuntime = {
  id: string;
  deviceId: string;
  deviceName: string;
  provider: "codex" | "claude" | "myflicker";
  skillVersion: string;
  available: boolean;
  lastSeenAt: string;
};
export type Blueprint = {
  id: string;
  ownerMemberId: string;
  ownerName: string;
  ownerAvatarUrl?: string;
  name: string;
  loadingInstruction: string;
  loadingCommand: string;
  runtimeDevice?: string;
  runtimeAgent?: string;
  runtimeId?: string;
  runtimeLabel?: string;
  invocationPolicy: "refuse" | "awaiting_owner" | "process";
  inChannel: boolean;
  editable: boolean;
  updatedAt: string;
};
export type MessageNode = {
  type?: string;
  text?: string;
  attrs?: {
    id?: string;
    label?: string;
    kind?: "agent" | "member" | "files" | "session" | "canvas" | "message";
  };
  content?: MessageNode[];
};
export type ChannelMessage = {
  id: string;
  channelId: string;
  seq: number;
  body: string;
  content: MessageNode;
  replyToMessageId?: string;
  senderMemberId?: string;
  senderBlueprintId?: string;
  senderName: string;
  senderAvatarUrl?: string;
  senderKind: "member" | "agent";
  createdAt: string;
};
export type AgentRequestStatus = {
  traceContext?: {version: number; traceparent?: string; entryId?: string} | null;
  id: string;
  state: string;
  triggerMessageId?: string;
  targetBlueprintId?: string;
  targetName: string;
  sourceCanvasId?: string;
  summary?: string;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
};
