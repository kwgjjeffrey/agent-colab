import { traceTargets } from "@/api/trace-locators";
import { WorkspaceActions } from "@/features/workspace/WorkspaceActions";
import { useAgentResultObservation } from "@/api/agent-result-observation";
import { beginOperation } from "@/api/telemetry";
import { operations } from "@/api/trace-operations";
import { runOperation, type OperationScope } from "@/api/operation-runner";
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
} from "lucide-react";
import { ContextIcon } from "@/features/context/ContextIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  embedded?: boolean;
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
  embedded,
  focusId,
  channelId,
  channelName,
  defaultAgent,
  installedAgents,
}: Props) {
  const context = useChannelContext();
  const [promptResources, setPromptResources] = useState<ContextResource[]>([]);
  const [deleting, setDeleting] = useState<CanvasDocument>();
  const [removing, setRemoving] = useState(false);
  const [items, setItems] = useState<CanvasDocument[]>([]),
    [folders, setFolders] = useState<CanvasFolder[]>([]),
    [selected, setSelected] = useState<string>(),
    [error, setError] = useState<string>(),
    [promptOpen, setPromptOpen] = useState(false),
    [participants, setParticipants] = useState<Participant[]>([]),
    [agents, setAgents] = useState<Blueprint[]>([]);
  async function load(parent?: OperationScope) {
return runOperation("canvas.list", async (operation) => {
const canvasJson = operation.json;

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

}, {parent:parent?.operation});
}
  useEffect(() => {
    setSelected(undefined);
    void load().catch((reason) => setError(String(reason)));
    void (async () => {return runOperation("canvas.participants", async (operation)=>{
const canvasJson=operation.json;

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

});})().catch((reason) => setError(String(reason)));
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
      {!embedded && <CanvasResourceTree
        channelId={channelId}
        documents={items}
        folders={folders}
        selectedId={selected}
        error={error}
        onSelect={setSelected}
        onChanged={load}
        onError={setError}
      />}
      <main className="min-w-0 flex-1">
        {embedded && current && <WorkspaceActions><Button variant="ghost" size="sm" data-trace-target={traceTargets("canvas.remove")} onClick={() => setDeleting(current)}>Delete</Button></WorkspaceActions>}
        {current ? (
          <CanvasEditor
            embedded={embedded}
            key={current.id}
            channelId={channelId}
            canvasId={current.id}
            title={current.title}
            canvasRef={canvasRef(current)}
            participants={participants}
            agents={agents}
            defaultAgent={defaultAgent}
            installedAgents={installedAgents}
            onRename={async (name) => {return runOperation("canvas.tree.rename", async (operation)=>{
const canvasJson=operation.json;

              await canvasJson(`/v1/canvases/${current.id}`, {
                method: "PATCH",
                body: JSON.stringify({ name }),
              });
              await load(operation);

});}}
            onGive={() => {
              void runOperation("canvas.handoff", async operation => operation.json<{content:string}>(`/v1/canvases/${current.id}/document`).then(row => {
                  setPromptResources(projectionResources(row.content,channelId,context?.resources ?? []));
                  setPromptOpen(true);
                }))
                .catch((reason) => setError(String(reason)));
            }}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Select a document
          </div>
        )}
      </main>
      <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !removing) setDeleting(undefined); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle><AlertDialogDescription>This removes the document from the Channel. The stored history is retained for recovery.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={removing} onClick={event => {
            event.preventDefault(); if (!deleting) return; setRemoving(true);
            void runOperation("canvas.remove", async operation => {
              await operation.response(`/v1/canvases/${deleting.id}`, {method:"DELETE"});
              setDeleting(undefined); await load(operation);
              window.dispatchEvent(new Event("colab:catalog-changed"));
            }).catch(reason => setError(String(reason))).finally(() => setRemoving(false));
          }}>{removing ? "Deleting…" : "Delete document"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  embedded,
  channelId,
  canvasId,
  title,
  canvasRef,
  participants,
  agents,
  defaultAgent,
  installedAgents,
  onRename,
  onGive,
}: {
  embedded?: boolean;
  channelId: string;
  canvasId: string;
  title: string;
  canvasRef: string;
  participants: Participant[];
  agents: Blueprint[];
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
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
  useAgentResultObservation(requests);
  async function refreshRequests() {return runOperation("canvas.agent.requests", async (operation)=>{
const canvasJson=operation.json;

    setRequests(
      await canvasJson<AgentRequestStatus[]>(
        `/v1/channels/${channelId}/agent-requests`,
      ),
    );

});}
  function pull() {
    if (pullInFlight.current) return pullInFlight.current;
    const pending = (async () => {return runOperation("canvas.reconcile", async (operation)=>{
const canvasJson=operation.json;

      const response = await operation.fetch(
        `/v1/canvases/${canvasId}/updates?after=${seq.current}&limit=1000`,
      );
      if (!response.ok) {
        if (![500, 502, 503, 504].includes(response.status)) throw new Error(await response.text());
        const cached = await canvasJson<{update: string; lastServerSeq: number; pending: number}>(
          `/v1/canvases/${canvasId}/local-replica`,
        );
        Y.applyUpdate(document, decode(cached.update), REMOTE);
        seq.current = Math.max(seq.current, cached.lastServerSeq);
        if (mounted.current) {
          setReady(true);
          setState("offline");
          setError("Offline — showing locally saved edits. Reconnect to synchronize.");
        }
        return;
      }
      const rows = await response.json() as CanvasUpdate[];
      for (const row of rows) {
        Y.applyUpdate(document, decode(row.update), REMOTE);
        seq.current = Math.max(seq.current, row.serverSeq);
      }
      if (mounted.current) {
        setReady(true);
        setState("synced");
        setError(undefined);
      }

});})().finally(() => {
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
return runOperation("canvas.title", async (operation) => {


    setEditingTitle(false);
    const value = draft.trim();
    if (value && value !== title) await onRename(value);
    else setDraft(title);

});
}
  return (
    <section data-trace-target={traceTargets("canvas.edit", "canvas.reconcile", "canvas.participants", "canvas.agent.requests")} className="flex h-full min-h-0 flex-col">
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
            <h2 data-trace-target={traceTargets("canvas.title")}
              hidden={embedded}
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
        <WorkspaceActions>{embedded&&<Button size="sm" variant="ghost" onClick={()=>setEditingTitle(true)}>Rename</Button>}<Button data-trace-target={traceTargets("canvas.handoff")} size="sm" variant="outline" onClick={onGive}>
          <SparklesIcon data-icon="inline-start" />
          Give to Agent
        </Button></WorkspaceActions>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {ready ? (
          <LoadedCanvasEditor
            canvasId={canvasId}
            canvasRef={canvasRef}
            document={document}
            participants={participants}
            agents={agents}
            defaultAgent={defaultAgent}
            installedAgents={installedAgents}
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
  avatarUrl?: string;
  agent?: Blueprint;
  person?: Participant;
};
function LoadedCanvasEditor({
  canvasId,
  canvasRef,
  document,
  participants,
  agents,
  defaultAgent,
  installedAgents,
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
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
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
  const [handoff, setHandoff] = useState<{ id: string; label: string; prompt: string; body: { targetBlueprintId: string; sectionMarkdown: string; contextRefs: { kind: string; id: string }[]; canvasRef: string } }>();
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
        avatarUrl: agent.ownerAvatarUrl,
      })),
      ...participants.map((person) => ({
        id: person.memberId,
        label: person.displayName,
        kind: "member" as const,
        description: "",
        person,
        avatarUrl: person.avatarUrl,
      })),
      ...(context?.resources.slice().sort((a, b) => ({ session: 0, files: 1, canvas: 2, message: 3 }[a.kind] - { session: 0, files: 1, canvas: 2, message: 3 }[b.kind])).map((row) => ({
        id: row.id,
        label: row.name,
        kind: row.kind,
        description: "",
      })) ?? []),
    ]
      .filter((item) => item.label.toLocaleLowerCase().includes(query))
      .slice(0, 20);
  }, [agents, participants, suggestion, context?.resources]);
  const suggestionPosition = (() => {
    if (!editor || !suggestion) return undefined;
    const caret = editor.view.coordsAtPos(suggestion.to);
    const width = 320;
    const left = caret.right + 8 + width <= window.innerWidth - 12
      ? caret.right + 8
      : Math.max(12, caret.left - width - 8);
    const heightBelow = window.innerHeight - caret.bottom - 16;
    const openAbove = heightBelow < 160 && caret.top > 180;
    const maxHeight = Math.min(360, Math.max(80, openAbove ? caret.top - 20 : heightBelow));
    return {
      left,
      top: openAbove ? Math.max(8, caret.top - maxHeight - 8) : caret.bottom + 8,
      maxHeight,
    };
  })();
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
  async function prepareSend(id: string, label: string, position: number) {
return runOperation("canvas.agent.prepare", async (operation) => {
const canvasJson = operation.json;

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
      const body = { targetBlueprintId: id, sectionMarkdown: section, contextRefs, canvasRef };
      const preview = await canvasJson<{ prompt: string }>(`/v1/canvases/${canvasId}/agent-prompt`, { method: "POST", body: JSON.stringify(body) });
      setHandoff({ id, label, prompt: preview.prompt, body });
    } catch (reason) { operation.fail();
      setError(String(reason));
    }

});
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
      const started = beginOperation(operations["canvas.edit"]);
      queue.current = queue.current.then(async () => {return runOperation("canvas.edit", async (operation)=>{
const canvasJson=operation.json;

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
        } catch (reason) {operation.fail();
          if (mounted.current) {
            setState("offline");
            setError(String(reason));
          }
        }

}, {started});});
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
        prepareSend,
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
          <div
            className="fixed z-50 w-80 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
            style={suggestionPosition}
          >
            {candidates.length ? (
              candidates.map((candidate) => (
                <button
                  key={`${candidate.kind}:${candidate.id}`}
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(candidate)}
                >
                  <ContextIcon kind={candidate.kind} name={candidate.label} avatarUrl={candidate.avatarUrl} />
                  <strong className="min-w-0 flex-1 truncate">{candidate.label}</strong>
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
        <AgentWorkDrawer
          request={workRequest}
          open={Boolean(workRequest)}
          onOpenChange={(open) => {
            if (!open) setWorkRequest(undefined);
          }}
        />
        <AgentPromptDialog
          sendTraceTarget={traceTargets("canvas.agent.send")}
          open={Boolean(handoff)}
          title={`Give “${handoff?.label ?? "Agent"}” this Canvas task`}
          description="Review the exact instruction, add a query if needed, then send or copy it."
          defaultAgent={defaultAgent}
          installedAgents={installedAgents}
          promptFor={(agent) => (handoff?.prompt ?? "").replaceAll("~/.agents/skills/agent-colab/bin/colab-canvas", agentSkillCommand(agent, "colab-canvas"))}
          onSend={async (query) => {return runOperation("canvas.agent.send", async (operation)=>{
const canvasJson=operation.json;

            if (!handoff) return;
            const row = await canvasJson<{ id: string; state: string }>(`/v1/canvases/${canvasId}/send-to-agent`, { method: "POST", body: JSON.stringify({ ...handoff.body, userQuery: query }) });
            onRequest({ id: row.id, state: row.state, targetBlueprintId: handoff.id, targetName: handoff.label, sourceCanvasId: canvasId });

});}}
          onClose={() => setHandoff(undefined)}
          onError={(message) => setError(message)}
        />
      </div>
    </CanvasMentionContext.Provider>
  ) : null;
}
