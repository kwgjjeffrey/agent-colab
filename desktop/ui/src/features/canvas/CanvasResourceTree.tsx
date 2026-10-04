import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { FileTextIcon, FolderIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trackedFetch } from "@/api/request-activity";

export type CanvasDocument = { id: string; channelId: string; title: string; folderId: string | null; schemaVersion: number; lastServerSeq: number; canEdit: boolean; updatedAt: string };
export type CanvasFolder = { id: string; channelId: string; parentFolderId: string | null; name: string; createdAt: string; updatedAt: string };
type Editing = { kind: "document" | "folder"; id: string; original: string; draft: string };
type Props = { channelId: string; documents: CanvasDocument[]; folders: CanvasFolder[]; selectedId?: string; error?: string; onSelect: (id: string) => void; onChanged: () => Promise<void>; onError: (value?: string) => void };
async function canvasJson<T>(url: string, init?: RequestInit): Promise<T> { const response = await trackedFetch(url, { headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init }); if (!response.ok) throw new Error(await response.text()); return response.json() as Promise<T>; }

function availableName(base: string, names: string[]) { const existing = new Set(names.map(name => name.toLocaleLowerCase())); if (!existing.has(base.toLocaleLowerCase())) return base; for (let index = 2; ; index += 1) { const candidate = `${base} ${index}`; if (!existing.has(candidate.toLocaleLowerCase())) return candidate; } }

export function CanvasResourceTree({ channelId, documents, folders, selectedId, error, onSelect, onChanged, onError }: Props) {
  const [editing, setEditing] = useState<Editing>(), [creating, setCreating] = useState(false);
  async function create(kind: "document" | "folder", parentId: string | null = null) {
    setCreating(true); onError(undefined);
    try {
      if (kind === "document") {
        const title = availableName("Untitled document", documents.filter(row => row.folderId === parentId).map(row => row.title));
        const row = await canvasJson<CanvasDocument>(`/v1/channels/${channelId}/canvases`, { method: "POST", body: JSON.stringify({ title, folderId: parentId }) });
        await onChanged(); onSelect(row.id); setEditing({ kind, id: row.id, original: row.title, draft: row.title });
      } else {
        const name = availableName("Untitled folder", folders.filter(row => row.parentFolderId === parentId).map(row => row.name));
        const row = await canvasJson<CanvasFolder>(`/v1/channels/${channelId}/canvas-folders`, { method: "POST", body: JSON.stringify({ name, parentFolderId: parentId }) });
        await onChanged(); setEditing({ kind, id: row.id, original: row.name, draft: row.name });
      }
    } catch (reason) { onError(String(reason)); } finally { setCreating(false); }
  }
  async function commit() {
    if (!editing) return;
    const pending = editing, name = pending.draft.trim(); setEditing(undefined);
    if (!name || name === pending.original) return;
    try { const url = pending.kind === "document" ? `/v1/canvases/${pending.id}` : `/v1/canvas-folders/${pending.id}`; await canvasJson(url, { method: "PATCH", body: JSON.stringify({ name }) }); await onChanged(); }
    catch (reason) { onError(String(reason)); await onChanged(); }
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setEditing(undefined); } }
  function editable(kind: Editing["kind"], id: string, name: string) {
    if (editing?.kind === kind && editing.id === id) return <Input className="h-7 flex-1 rounded-sm px-1" value={editing.draft} autoFocus onFocus={event => event.currentTarget.select()} onChange={event => setEditing({ ...editing, draft: event.target.value })} onKeyDown={keyDown} onBlur={() => void commit()} />;
    return <span className="min-w-0 flex-1 truncate" onDoubleClick={event => { event.stopPropagation(); setEditing({ kind, id, original: name, draft: name }); }}>{name}</span>;
  }
  function renderBranch(parentId: string | null = null, depth = 0): ReactNode[] {
    const branchFolders = folders.filter(folder => (folder.parentFolderId ?? null) === parentId), branchDocuments = documents.filter(document => (document.folderId ?? null) === parentId);
    return [...branchFolders.flatMap(folder => [<div key={`folder:${folder.id}`} className="group flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted" style={{ paddingInlineStart: `${8 + depth * 16}px` }}><FolderIcon className="size-4 shrink-0" />{editable("folder", folder.id, folder.name)}<Button size="icon-xs" variant="ghost" aria-label={`Create document in ${folder.name}`} onClick={() => void create("document", folder.id)}><PlusIcon /></Button></div>, ...renderBranch(folder.id, depth + 1)]), ...branchDocuments.map(document => <div key={document.id} className={`flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted ${selectedId === document.id ? "bg-muted" : ""}`} style={{ paddingInlineStart: `${8 + depth * 16}px` }} onClick={() => onSelect(document.id)}><FileTextIcon className="size-4 shrink-0" />{editable("document", document.id, document.title)}</div>)];
  }
  return <aside className="w-64 shrink-0 border-r p-3"><DropdownMenu><DropdownMenuTrigger render={<Button className="mb-3 w-full" disabled={creating}><PlusIcon data-icon="inline-start" />New</Button>} /><DropdownMenuContent><DropdownMenuGroup><DropdownMenuItem onClick={() => void create("document")}><FileTextIcon />Document</DropdownMenuItem><DropdownMenuItem onClick={() => void create("folder")}><FolderIcon />Folder</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu><div className="flex flex-col gap-0.5">{renderBranch()}</div>{!documents.length && !folders.length && !error && <p className="px-2 py-8 text-center text-sm text-muted-foreground">Create a document or folder for people and Agents to edit together.</p>}{error && <p className="p-2 text-sm text-destructive">{error}</p>}</aside>;
}
