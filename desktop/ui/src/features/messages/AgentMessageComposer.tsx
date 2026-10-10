import { operations } from "@/api/trace-operations";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { ContextIcon } from "@/features/context/ContextIcon";
import { Button } from "@/components/ui/button";
import type { Blueprint, ChannelMessage, Participant } from "./types";
import { useChannelContext } from "@/features/context/ChannelContext";
import type { ResourceKind } from "@/features/context/context-model";
import { loadMessageDraft, saveMessageDraft } from "./message-drafts";
import { ContextMentionNode } from "@/features/context/ContextMentionNode";

export type AgentMention = { blueprintId: string; label: string };
export type ComposedAgentMessage = {
  plainText: string;
  content: EditorNode;
  mentions: AgentMention[];
};
export type EditorNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
};
type MentionCandidate = {
  id: string;
  label: string;
  kind: "agent" | "member" | ResourceKind;
  description: string;
  avatarUrl?: string;
};

/** Plain text preserves the visible mention; routing identity lives only in atomic node attrs. */
export function serializeAgentDocument(
  document: EditorNode,
): ComposedAgentMessage {
  const mentions: AgentMention[] = [];
  const render = (node: EditorNode): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "mention") {
      const mention = {
        blueprintId: String(node.attrs?.id ?? ""),
        label: String(node.attrs?.label ?? node.attrs?.id ?? ""),
      };
      if (
        (node.attrs?.kind === undefined || node.attrs.kind === "agent") &&
        mention.blueprintId &&
        !mentions.some((item) => item.blueprintId === mention.blueprintId)
      )
        mentions.push(mention);
      return `@${mention.label}`;
    }
    if (node.type === "hardBreak") return "\n";
    const value = (node.content ?? []).map(render).join("");
    return node.type === "paragraph" ? `${value}\n` : value;
  };
  const clean = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();
  return { plainText: clean(render(document)), content: document, mentions };
}

/**
 * Agent references are atomic editor nodes, not decorated text. The visible label may change,
 * while the request identity remains the immutable blueprint id carried by the node attributes.
 */
export function AgentMessageComposer({
  draftKey,
  channelName,
  agents,
  participants,
  busy,
  replyingTo,
  onCancelReply,
  onSubmit,
}: {
  draftKey: string;
  channelName: string;
  agents: Blueprint[];
  participants: Participant[];
  busy: boolean;
  replyingTo?: ChannelMessage;
  onCancelReply: () => void;
  onSubmit: (message: ComposedAgentMessage) => Promise<void>;
}) {
  const context = useChannelContext();
  const [suggestion, setSuggestion] = useState<{
      query: string;
      from: number;
      to: number;
    }>(),
    [submitting, setSubmitting] = useState(false);
  const mentionExtension = useMemo(
    () =>
      Mention.extend({
        addNodeView() { return ReactNodeViewRenderer(ContextMentionNode); },
        addAttributes() {
          return { ...this.parent?.(), kind: { default: "agent" } };
        },
      }).configure({
        renderHTML: ({ node }) => [
          "span",
          {
            class:
              node.attrs.kind === "member" ? "member-mention" : "agent-mention",
            "data-mention-kind": node.attrs.kind,
            "data-mention-id": node.attrs.id,
          },
          `@${node.attrs.label ?? node.attrs.id}`,
        ],
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
      }),
    [],
  );
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: "Write a message… Type @ to mention a teammate or Agent." }),
      mentionExtension,
    ],
    content: loadMessageDraft(draftKey) ?? "",
    editorProps: {
      attributes: {
        class: "agent-message-editor",
        "aria-label": `Message ${channelName}`,
      },
      handleKeyDown: (_view, event) => {
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.isComposing ||
          event.keyCode === 229
        )
          return false;
        event.preventDefault();
        void submitCurrent();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      saveMessageDraft(draftKey, editor.isEmpty ? undefined : editor.getJSON());
      const selection = editor.state.selection;
      if (!selection.empty) {
        setSuggestion(undefined);
        return;
      }
      const before = editor.state.doc.textBetween(
        Math.max(0, selection.from - 80),
        selection.from,
        " ",
        "\uFFFC",
      );
      const match = before.match(/(?:^|\s)@([^\s@]*)$/u);
      if (!match) {
        setSuggestion(undefined);
        return;
      }
      const query = match[1] ?? "";
      setSuggestion({
        query,
        from: selection.from - query.length - 1,
        to: selection.from,
      });
    },
  }, [draftKey]);
  useEffect(() => () => editor?.destroy(), [editor]);
  useEffect(() => {
    if (suggestion)
      void context?.refresh().catch(() => {});
  }, [context?.channelId, suggestion?.from]);
  const candidates = useMemo<MentionCandidate[]>(() => {
    if (!suggestion) return [];
    const query = suggestion.query.toLocaleLowerCase();
    return [
      ...agents.map((agent) => ({
        id: agent.id,
        label: agent.name,
        kind: "agent" as const,
        description: `${agent.ownerName}'s Agent`,
        avatarUrl: agent.ownerAvatarUrl,
      })),
      ...participants.map((person) => ({
        id: person.memberId,
        label: person.displayName,
        kind: "member" as const,
        description: "",
        avatarUrl: person.avatarUrl,
      })),
      ...(context?.resources
        .filter((row) => row.kind !== "message")
        .sort((a, b) => ({ session: 0, files: 1, canvas: 2, message: 3 }[a.kind] - { session: 0, files: 1, canvas: 2, message: 3 }[b.kind]))
        .map((row) => ({
          id: row.id,
          label: row.name,
          kind: row.kind,
          description: "",
        })) ?? []),
    ]
      .filter((item) => item.label.toLocaleLowerCase().includes(query))
      .slice(0, 20);
  }, [agents, participants, suggestion, context?.resources]);

  function choose(candidate: MentionCandidate) {
    if (!editor || !suggestion) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: suggestion.from, to: suggestion.to })
      .insertContent([
        {
          type: "mention",
          attrs: {
            id: candidate.id,
            label: candidate.label,
            kind: candidate.kind,
          },
        },
        { type: "text", text: " " },
      ])
      .run();
    setSuggestion(undefined);
  }
  async function submitCurrent() {
    if (!editor || submitting || busy) return;
    const composed = serializeAgentDocument(editor.getJSON());
    if (!composed.plainText) return;
    setSubmitting(true);
    try {
      await onSubmit(composed);
      editor.commands.clearContent();
      setSuggestion(undefined);
    } finally {
      setSubmitting(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void submitCurrent();
  }
  return (
    <form
      onSubmit={submit}
      className="relative shrink-0 border-t bg-muted px-4 py-3"
    >
      {suggestion && (
        <div className="absolute bottom-full left-4 z-20 mb-2 max-h-80 w-80 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {candidates.length ? (
            candidates.map((candidate) => (
              <button
                type="button"
                key={`${candidate.kind}:${candidate.id}`}
                className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(candidate)}
              >
                <ContextIcon kind={candidate.kind} name={candidate.label} avatarUrl={candidate.avatarUrl} />
                <span className="min-w-0 truncate font-medium">
                  {candidate.label}
                </span>
                {candidate.kind === "agent" && candidate.description && (
                  <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground">{candidate.description}</span>
                )}
              </button>
            ))
          ) : (
            <p className="p-2 text-sm text-muted-foreground">
              No matching Agent or member
            </p>
          )}
        </div>
      )}
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted/50 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            <strong>{replyingTo.senderName}</strong>: {replyingTo.body}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Cancel reply"
            onClick={onCancelReply}
          >
            <XIcon />
          </Button>
        </div>
      )}
      <div className="flex items-end gap-3">
        <div className="min-h-12 min-w-0 flex-1 px-1 py-3">
          <EditorContent editor={editor} />
        </div>
        <Button
          data-trace-target={operations["messages.send"].entry.target}
          type="submit"
          size="icon"
          className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/85"
          disabled={submitting || busy}
          aria-label={submitting ? "Sending" : "Send message"}
        >
          <ArrowUpIcon />
        </Button>
      </div>
    </form>
  );
}
