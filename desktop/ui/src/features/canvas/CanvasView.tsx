import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { EditorContent, useEditor, ReactNodeViewRenderer } from "@tiptap/react";
import { CanvasMention, CanvasMentionContext } from "./CanvasMention";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import Mention from "@tiptap/extension-mention";
import { useChannelContext } from "@/features/context/ChannelContext";
import {
  isResourceKind,
  projectionResources,
  readInstructions,
  type ContextResource,
  type ResourceKind,
} from "@/features/context/context-model";
import * as Y from "yjs";
import {
  BotIcon,
  CodeIcon,
  GripVerticalIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackedFetch } from "@/api/request-activity";
import { accountRealtime } from "@/api/realtime";
import {
  AgentPromptDialog,
  agentSkillCommand,
  type AgentTarget,
} from "@/features/agent/AgentPromptDialog";
import {
  CanvasResourceTree,
  type CanvasDocument,
  type CanvasFolder,
} from "@/features/canvas/CanvasResourceTree";
import type { Blueprint, Participant } from "@/features/messages/types";
import { AgentWorkDrawer } from "@/features/agent/AgentWorkDrawer";

type CanvasUpdate = {
  canvasId: string;
  serverSeq: number;
  clientUpdateId: string;
  encoding: string;
  update: string;
};
type Props = {
  focusId?: string;
  channelId: string;
  channelName: string;
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
};
type AgentRequestStatus = {
  id: string;
  state: string;
  targetBlueprintId: string;
  targetName: string;
  sourceCanvasId?: string;
};

function decode(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function encode(value: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000)
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
export async function canvasJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await trackedFetch(url, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function CanvasView({
  focusId,
  channelId,
  channelName,
  defaultAgent,
  installedAgents,
}: Props) {
  const context = useChannelContext();
  const [promptResources, setPromptResources] = useState<ContextResource[]>([]);
  const [items, setItems] = useState<CanvasDocument[]>([]),
    [folders, setFolders] = useState<CanvasFolder[]>([]),
    [selected, setSelected] = useState<string>(),
    [error, setError] = useState<string>(),
    [promptOpen, setPromptOpen] = useState(false),
    [participants, setParticipants] = useState<Participant[]>([]),
    [agents, setAgents] = useState<Blueprint[]>([]);
  async function load() {
    const [documents, directories] = await Promise.all([
      canvasJson<CanvasDocument[]>(`/v1/channels/${channelId}/canvases`),
      canvasJson<CanvasFolder[]>(`/v1/channels/${channelId}/canvas-folders`),
    ]);
    setItems(documents);
    setFolders(directories);
    setSelected((current) =>
      current && documents.some((row) => row.id === current)
        ? current
        : documents[0]?.id,
    );
  }
  useEffect(() => {
    setSelected(undefined);
    void load().catch((reason) => setError(String(reason)));
    void (async () => {
      const people = await canvasJson<Participant[]>(
        `/v1/channels/${channelId}/participants`,
      );
      setParticipants(people);
      const groups = await Promise.all(
        people.map((person) =>
          canvasJson<Blueprint[]>(
            `/v1/channels/${channelId}/blueprints?ownerMemberId=${person.memberId}`,
          ),
        ),
      );
      setAgents(groups.flat().filter((agent) => agent.inChannel));
    })().catch((reason) => setError(String(reason)));
  }, [channelId]);
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  function folderPath(folderId: string | null) {
    const parts: string[] = [],
      seen = new Set<string>();
    let current = folderId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const folder = folderById.get(current);
      if (!folder) break;
      parts.unshift(folder.name);
      current = folder.parentFolderId;
    }
    return parts;
  }
  const current = items.find((item) => item.id === selected);
  useEffect(() => {
    if (focusId && items.some((row) => row.id === focusId))
      setSelected(focusId);
  }, [focusId, items]);
  function canvasRef(document: CanvasDocument) {
    return `colab://channel/${[channelName, "canvas", ...folderPath(document.folderId), document.title].map(encodeURIComponent).join("/")}`;
  }
  function promptFor(agent: AgentTarget) {
    if (!current) return "";
    const command = agentSkillCommand(agent, "colab-canvas"),
      ref = canvasRef(current);
    return `Work on “${current.title}”.

Read this document first:
${command} read --ref ${shellQuote(ref)} --offset 1 --limit 1000

Tools below are at your disposal if the user's task requires them.

To edit this document, send a Codex patch on stdin:
${command} apply-patch --ref ${shellQuote(ref)} <<'PATCH'
*** Begin Patch
*** Update File: document.md
@@
-exact existing text
+replacement text
*** End Patch
PATCH

If the patch reports a conflict, read the current document and retry. Structured component fences cannot be changed with a text patch.

To explore other Canvas documents in this Channel:
${command} list --channel ${shellQuote(channelName)}

${readInstructions(promptResources, agent)}`;
  }
  return (
    <div className="flex h-full min-h-0">
      <CanvasResourceTree
        channelId={channelId}
        documents={items}
        folders={folders}
        selectedId={selected}
        error={error}
        onSelect={setSelected}
        onChanged={load}
        onError={setError}
      />
      <main className="min-w-0 flex-1">
        {current ? (
          <CanvasEditor
            key={current.id}
            channelId={channelId}
            canvasId={current.id}
            title={current.title}
            canvasRef={canvasRef(current)}
            participants={participants}
            agents={agents}
            onRename={async (name) => {
              await canvasJson(`/v1/canvases/${current.id}`, {
                method: "PATCH",
                body: JSON.stringify({ name }),
              });
              await load();
            }}
            onGive={() => {
              void canvasJson<{ content: string }>(
                `/v1/canvases/${current.id}/document`,
              )
                .then((row) => {
                  setPromptResources(
                    projectionResources(
                      row.content,
                      channelId,
                      context?.resources ?? [],
                    ),
                  );
                  setPromptOpen(true);
                })
                .catch((reason) => setError(String(reason)));
            }}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Select a document
          </div>
        )}
      </main>
      <AgentPromptDialog
        onForward={() => {
          const row = context?.resources.find(
            (row) => row.kind === "canvas" && row.id === current?.id,
          );
          if (context && current) {
            setPromptOpen(false);
            context.forward([
              row ?? {
                kind: "canvas",
                id: current.id,
                name: current.title,
                channelId,
              },
            ]);
          }
        }}
        open={promptOpen}
        title={`Give “${current?.title ?? ""}” to Agent`}
        description="Copy these Canvas commands and continue the task in your coding Agent."
        defaultAgent={defaultAgent}
        installedAgents={installedAgents}
        promptFor={promptFor}
        onClose={() => setPromptOpen(false)}
        onError={setError}
      />
    </div>
  );
}

const REMOTE = Symbol("colab-canvas-remote");
function CanvasEditor({
  channelId,
  canvasId,
  title,
  canvasRef,
  participants,
  agents,
  onRename,
  onGive,
}: {
  channelId: string;
  canvasId: string;
  title: string;
  canvasRef: string;
  participants: Participant[];
  agents: Blueprint[];
  onRename: (name: string) => Promise<void>;
  onGive: () => void;
}) {
  const document = useMemo(() => new Y.Doc(), [canvasId]),
    seq = useRef(0),
    mounted = useRef(true),
    pullInFlight = useRef<Promise<void> | undefined>(undefined);
  const [ready, setReady] = useState(false),
    [state, setState] = useState<"loading" | "saving" | "offline" | "synced">(
      "loading",
    ),
    [error, setError] = useState<string>(),
    [requests, setRequests] = useState<AgentRequestStatus[]>([]);
  async function refreshRequests() {
    setRequests(
      await canvasJson<AgentRequestStatus[]>(
        `/v1/channels/${channelId}/agent-requests`,
      ),
    );
  }
  function pull() {
    if (pullInFlight.current) return pullInFlight.current;
    const pending = (async () => {
      const rows = await canvasJson<CanvasUpdate[]>(
        `/v1/canvases/${canvasId}/updates?after=${seq.current}&limit=1000`,
      );
      for (const row of rows) {
        Y.applyUpdate(document, decode(row.update), REMOTE);
        seq.current = Math.max(seq.current, row.serverSeq);
      }
      if (mounted.current) {
        setReady(true);
        setState("synced");
        setError(undefined);
      }
    })().finally(() => {
      if (pullInFlight.current === pending) pullInFlight.current = undefined;
    });
    pullInFlight.current = pending;
    return pending;
  }
  useEffect(() => {
    mounted.current = true;
    void pull().catch((reason) => {
      setState("offline");
      setError(String(reason));
    });
    const unsubscribe = accountRealtime.subscribe((frame) => {
      if (
        (frame.type === "canvas.invalidated" &&
          frame.canvasId === canvasId &&
          (frame.latestSeq ?? 0) > seq.current) ||
        frame.type === "realtime.connected"
      )
        void pull().catch((reason) => {
          setState("offline");
          setError(String(reason));
        });
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      document.destroy();
    };
  }, [canvasId, document]);
  useEffect(() => {
    void refreshRequests().catch(() => {});
    const unsubscribe = accountRealtime.subscribe((frame) => {
      if (
        frame.type === "realtime.connected" ||
        (frame.type === "agent_requests.invalidated" &&
          frame.channelId === channelId)
      )
        void refreshRequests().catch(() => {});
    });
    const timer = window.setInterval(
      () => void refreshRequests().catch(() => {}),
      5000,
    );
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [canvasId, channelId]);
  const [editingTitle, setEditingTitle] = useState(false),
    [draft, setDraft] = useState(title);
  async function commitTitle() {
    setEditingTitle(false);
    const value = draft.trim();
    if (value && value !== title) await onRename(value);
    else setDraft(title);
  }
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editingTitle ? (
            <Input
              className="h-8 max-w-sm"
              value={draft}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setDraft(title);
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <h2
              className="truncate font-medium"
              onDoubleClick={() => setEditingTitle(true)}
            >
              {title}
            </h2>
          )}
          <span
            className={`shrink-0 text-xs ${state === "offline" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {state === "loading"
              ? "Loading…"
              : state === "saving"
                ? "Saving locally…"
                : state === "offline"
                  ? "Saved locally · Offline"
                  : "Synced"}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={onGive}>
          <SparklesIcon data-icon="inline-start" />
          Give to Agent
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {ready ? (
          <LoadedCanvasEditor
            canvasId={canvasId}
            canvasRef={canvasRef}
            document={document}
            participants={participants}
            agents={agents}
            requests={requests}
            onRequest={(request) =>
              setRequests((current) => [
                request,
                ...current.filter((row) => row.id !== request.id),
              ])
            }
            seq={seq}
            mounted={mounted}
            setState={setState}
            setError={setError}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Loading Canvas…
          </div>
        )}
      </div>
      {error && (
        <div className="border-t px-5 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </section>
  );
}

type MentionCandidate = {
  id: string;
  label: string;
  kind: "agent" | "member" | ResourceKind;
  description: string;
  agent?: Blueprint;
  person?: Participant;
};
function LoadedCanvasEditor({
  canvasId,
  canvasRef,
  document,
  participants,
  agents,
  requests,
  onRequest,
  seq,
  mounted,
  setState,
  setError,
}: {
  canvasId: string;
  canvasRef: string;
  document: Y.Doc;
  participants: Participant[];
  agents: Blueprint[];
  requests: AgentRequestStatus[];
  onRequest: (request: AgentRequestStatus) => void;
  seq: MutableRefObject<number>;
  mounted: MutableRefObject<boolean>;
  setState: Dispatch<
    SetStateAction<"loading" | "saving" | "offline" | "synced">
  >;
  setError: Dispatch<SetStateAction<string | undefined>>;
}) {
  const context = useChannelContext();
  const queue = useRef(Promise.resolve());
  const containerRef = useRef<HTMLDivElement>(null);
  const [suggestion, setSuggestion] = useState<{
    query: string;
    from: number;
    to: number;
  }>();
  const [blockMenu, setBlockMenu] = useState<{
    left: number;
    top: number;
    pos: number;
    open: boolean;
  }>();
  const [workRequest, setWorkRequest] = useState<AgentRequestStatus>();
  const mentionExtension = useMemo(
    () =>
      Mention.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CanvasMention);
        },
        addAttributes() {
          return {
            ...this.parent?.(),
            kind: { default: "agent" },
            mentionId: { default: null },
          };
        },
      }).configure({
        renderHTML: ({ node }) => [
          "span",
          {
            class:
              node.attrs.kind === "member" ? "member-mention" : "agent-mention",
            tabindex: "0",
            "data-canvas-mention": "true",
            "data-mention-kind": node.attrs.kind,
            "data-mention-id": node.attrs.id,
          },
          `@${node.attrs.label ?? node.attrs.id}`,
        ],
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
      }),
    [],
  );
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        mentionExtension,
        Collaboration.configure({ document }),
      ],
      editorProps: {
        attributes: {
          class:
            "canvas-editor-content mx-auto min-h-full w-full max-w-4xl px-12 py-8 outline-none",
        },
      },
      onUpdate: ({ editor }) => {
        const selection = editor.state.selection;
        if (!selection.empty) return setSuggestion(undefined);
        const before = editor.state.doc.textBetween(
          Math.max(0, selection.from - 80),
          selection.from,
          " ",
          "\uFFFC",
        );
        const match = before.match(/(?:^|\s)@([^\s@]*)$/u);
        if (!match) return setSuggestion(undefined);
        const query = match[1] ?? "";
        setSuggestion({
          query,
          from: selection.from - query.length - 1,
          to: selection.from,
        });
      },
    },
    [document, mentionExtension, agents, participants],
  );
  useEffect(() => {
    if (suggestion) void context?.refresh(true).catch(() => {});
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
        agent,
      })),
      ...participants.map((person) => ({
        id: person.memberId,
        label: person.displayName,
        kind: "member" as const,
        description: person.email,
        person,
      })),
      ...(context?.resources.map((row) => ({
        id: row.id,
        label: row.name,
        kind: row.kind,
        description: row.kind,
      })) ?? []),
    ]
      .filter((item) => item.label.toLocaleLowerCase().includes(query))
      .slice(0, 8);
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
            mentionId: crypto.randomUUID(),
          },
        },
        { type: "text", text: " " },
      ])
      .run();
    setSuggestion(undefined);
  }
  function sectionMarkdown(position: number) {
    if (!editor) return "";
    const blocks: { node: typeof editor.state.doc; pos: number }[] = [];
    editor.state.doc.forEach((node, offset) =>
      blocks.push({ node: node as typeof editor.state.doc, pos: offset + 1 }),
    );
    const cursor = position + 1;
    let index = Math.max(
      0,
      blocks.findIndex(
        ({ node, pos }) => cursor >= pos && cursor <= pos + node.nodeSize,
      ),
    );
    let heading = -1;
    for (let current = index; current >= 0; current -= 1)
      if (blocks[current].node.type.name === "heading") {
        heading = current;
        break;
      }
    const atomText = (node: typeof editor.state.doc) =>
      node.type.name === "mention"
        ? isResourceKind(node.attrs.kind)
          ? `[${node.attrs.label} · ${node.attrs.kind}:${node.attrs.id}]`
          : `@${node.attrs.label}`
        : "\n";
    if (heading < 0)
      return editor.state.doc.textBetween(
        0,
        editor.state.doc.content.size,
        "\n",
        atomText,
      );
    const level = Number(blocks[heading].node.attrs.level ?? 1);
    let end = editor.state.doc.content.size;
    for (let current = heading + 1; current < blocks.length; current += 1) {
      const block = blocks[current].node;
      if (
        block.type.name === "heading" &&
        Number(block.attrs.level ?? 1) <= level
      ) {
        end = blocks[current].pos - 1;
        break;
      }
    }
    return editor.state.doc.textBetween(
      blocks[heading].pos,
      end,
      "\n",
      atomText,
    );
  }
  async function send(id: string, label: string, position: number) {
    try {
      if (!context) throw new Error("Channel context is unavailable.");
      const section = sectionMarkdown(position);
      const projected = await canvasJson<{ content: string }>(
        `/v1/canvases/${canvasId}/document`,
      );
      const known = new Set(
        projectionResources(projected.content, context.channelId, []).map(
          (row) => `${row.kind}:${row.id}`,
        ),
      );
      const contextRefs = [
        ...section.matchAll(
          /\b(files|session|canvas|message):([0-9a-f-]{36})\b/g,
        ),
      ].map((match) => ({ kind: match[1], id: match[2] }));
      if (contextRefs.some((row) => !known.has(`${row.kind}:${row.id}`)))
        throw new Error(
          "Wait for document synchronization before sending referenced context.",
        );
      const row = await canvasJson<{ id: string; state: string }>(
        `/v1/canvases/${canvasId}/send-to-agent`,
        {
          method: "POST",
          body: JSON.stringify({
            targetBlueprintId: id,
            sectionMarkdown: section,
            contextRefs,
            canvasRef,
          }),
        },
      );
      onRequest({
        id: row.id,
        state: row.state,
        targetBlueprintId: id,
        targetName: label,
        sourceCanvasId: canvasId,
      });
    } catch (reason) {
      setError(String(reason));
    }
  }
  function trackBlock(event: React.MouseEvent) {
    if (blockMenu?.open || !editor || !containerRef.current) return;
    const node = event.target;
    if (!(node instanceof Element)) return;
    const block = node.closest<HTMLElement>(
      ".ProseMirror > p, .ProseMirror > h1, .ProseMirror > h2, .ProseMirror > h3, .ProseMirror > blockquote, .ProseMirror > pre, .ProseMirror > ul, .ProseMirror > ol",
    );
    if (!block) return;
    const outer = containerRef.current.getBoundingClientRect(),
      rect = block.getBoundingClientRect();
    let pos = 0;
    try {
      pos = editor.view.posAtDOM(block, 0);
    } catch {
      return;
    }
    setBlockMenu({
      left: Math.max(8, rect.left - outer.left - 34),
      top: rect.top - outer.top,
      pos,
      open: false,
    });
  }
  function formatBlock(
    kind:
      | "paragraph"
      | "h1"
      | "h2"
      | "h3"
      | "bullet"
      | "ordered"
      | "quote"
      | "code",
  ) {
    if (!editor || !blockMenu) return;
    let chain = editor
      .chain()
      .setTextSelection(
        Math.min(blockMenu.pos + 1, editor.state.doc.content.size),
      )
      .focus();
    if (kind === "paragraph") chain.setParagraph().run();
    else if (kind === "h1" || kind === "h2" || kind === "h3")
      chain.setHeading({ level: Number(kind.slice(1)) as 1 | 2 | 3 }).run();
    else if (kind === "bullet") chain.toggleBulletList().run();
    else if (kind === "ordered") chain.toggleOrderedList().run();
    else if (kind === "quote") chain.toggleBlockquote().run();
    else chain.toggleCodeBlock().run();
    setBlockMenu(undefined);
  }
  useEffect(() => {
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      setState("saving");
      const id = crypto.randomUUID();
      queue.current = queue.current.then(async () => {
        try {
          const row = await canvasJson<CanvasUpdate>(
            `/v1/canvases/${canvasId}/updates`,
            {
              method: "POST",
              body: JSON.stringify({
                clientUpdateId: id,
                update: encode(update),
              }),
            },
          );
          seq.current = Math.max(seq.current, row.serverSeq);
          if (mounted.current) {
            setState("synced");
            setError(undefined);
          }
        } catch (reason) {
          if (mounted.current) {
            setState("offline");
            setError(String(reason));
          }
        }
      });
    };
    document.on("update", onUpdate);
    return () => document.off("update", onUpdate);
  }, [canvasId, document, mounted, seq, setError, setState]);
  return editor ? (
    <CanvasMentionContext.Provider
      value={{
        canvasId,
        agents,
        participants,
        requests,
        send,
        showWork: setWorkRequest,
      }}
    >
      <div
        ref={containerRef}
        className="relative min-h-full"
        onMouseMove={trackBlock}
        onMouseLeave={() => {
          if (!blockMenu?.open) setBlockMenu(undefined);
        }}
        onMouseOver={(event) => {
          trackBlock(event);
        }}
        onClick={(event) => {
          trackBlock(event);
        }}
      >
        <EditorContent editor={editor} />
        {blockMenu && (
          <div
            className="absolute z-20"
            style={{ left: blockMenu.left, top: blockMenu.top }}
            onMouseLeave={() => {
              if (!blockMenu.open) setBlockMenu(undefined);
            }}
          >
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Change block type"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                setBlockMenu((current) =>
                  current ? { ...current, open: !current.open } : current,
                )
              }
            >
              <GripVerticalIcon />
            </Button>
            {blockMenu.open && (
              <div
                className="absolute left-8 top-0 w-52 rounded-lg border bg-popover p-1 shadow-lg"
                onMouseDown={(event) => event.preventDefault()}
              >
                {[
                  ["paragraph", "Text", PilcrowIcon],
                  ["h1", "Heading 1", Heading1Icon],
                  ["h2", "Heading 2", Heading2Icon],
                  ["h3", "Heading 3", Heading3Icon],
                  ["bullet", "Bulleted list", ListIcon],
                  ["ordered", "Numbered list", ListOrderedIcon],
                  ["quote", "Quote", QuoteIcon],
                  ["code", "Code", CodeIcon],
                ].map(([kind, label, Icon]) => (
                  <button
                    key={String(kind)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() =>
                      formatBlock(
                        kind as
                          | "paragraph"
                          | "h1"
                          | "h2"
                          | "h3"
                          | "bullet"
                          | "ordered"
                          | "quote"
                          | "code",
                      )
                    }
                  >
                    <Icon className="size-4" />
                    {String(label)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {suggestion && (
          <div className="absolute left-10 top-16 z-20 w-80 rounded-lg border bg-popover p-1 shadow-lg">
            {candidates.length ? (
              candidates.map((candidate) => (
                <button
                  key={`${candidate.kind}:${candidate.id}`}
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(candidate)}
                >
                  {candidate.kind === "agent" ? (
                    <BotIcon className="size-4" />
                  ) : (
                    <UserIcon className="size-4" />
                  )}
                  <strong className="truncate">{candidate.label}</strong>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {candidate.description}
                  </span>
                </button>
              ))
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                No matching Agent or member
              </p>
            )}
          </div>
        )}
        <AgentWorkDrawer
          request={workRequest}
          open={Boolean(workRequest)}
          onOpenChange={(open) => {
            if (!open) setWorkRequest(undefined);
          }}
        />
      </div>
    </CanvasMentionContext.Provider>
  ) : null;
}
