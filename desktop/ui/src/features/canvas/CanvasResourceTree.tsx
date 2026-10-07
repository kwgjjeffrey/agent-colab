import { traceTargets } from "@/api/trace-locators";
import { runOperation, type OperationScope } from "@/api/operation-runner";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { FileTextIcon, FolderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trackedFetch } from "@/api/request-activity";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export type CanvasDocument = { id: string; channelId: string; title: string; folderId: string | null; schemaVersion: number; lastServerSeq: number; canEdit: boolean; updatedAt: string };
export type CanvasFolder = { id: string; channelId: string; parentFolderId: string | null; name: string; createdAt: string; updatedAt: string };
type Editing = { kind: "document" | "folder"; id: string; original: string; draft: string };
type Props = { channelId: string; documents: CanvasDocument[]; folders: CanvasFolder[]; selectedId?: string; error?: string; onSelect: (id: string) => void; onChanged: (parent?: OperationScope) => Promise<void>; onError: (value?: string) => void };
async function canvasJson<T>(url: string, init?: RequestInit): Promise<T> { const response = await trackedFetch(url, { headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init }); if (!response.ok) throw new Error(await response.text()); return response.json() as Promise<T>; }

function availableName(base: string, names: string[]) { const existing = new Set(names.map(name => name.toLocaleLowerCase())); if (!existing.has(base.toLocaleLowerCase())) return base; for (let index = 2; ; index += 1) { const candidate = `${base} ${index}`; if (!existing.has(candidate.toLocaleLowerCase())) return candidate; } }

export function CanvasResourceTree({ channelId, documents, folders, selectedId, error, onSelect, onChanged, onError }: Props) {
  const [editing, setEditing] = useState<Editing>(), [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CanvasDocument>();
  const [dragging, setDragging] = useState<string>();
  async function move(id: string, folderId: string | null, index: number) {
    return runOperation("canvas.move", async operation => {
    const mutate=operation.response;
    try { await mutate(`/v1/canvases/${id}/position`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ folderId, index }) }); await onChanged(operation); }
    catch (reason) { operation.fail(); onError(String(reason)); }
    finally { setDragging(undefined); }
    });
  }
  async function remove() {
    if (!deleting) return;
    return runOperation("canvas.remove", async operation => {
    const mutate=operation.response;
    try { await mutate(`/v1/canvases/${deleting.id}`, { method: "DELETE" }); setDeleting(undefined); await onChanged(operation); }
    catch (reason) { operation.fail(); onError(String(reason)); }
    });
  }
  async function create(kind: "document" | "folder", parentId: string | null = null) {
return runOperation("canvas.create", async (operation) => {
const canvasJson = operation.json;

    setCreating(true); onError(undefined);
    try {
      if (kind === "document") {
        const title = availableName("Untitled document", documents.filter(row => row.folderId === parentId).map(row => row.title));
        const row = await canvasJson<CanvasDocument>(`/v1/channels/${channelId}/canvases`, { method: "POST", body: JSON.stringify({ title, folderId: parentId }) });
        await onChanged(operation); onSelect(row.id); setEditing({ kind, id: row.id, original: row.title, draft: row.title });
      } else {
        const name = availableName("Untitled folder", folders.filter(row => row.parentFolderId === parentId).map(row => row.name));
        const row = await canvasJson<CanvasFolder>(`/v1/channels/${channelId}/canvas-folders`, { method: "POST", body: JSON.stringify({ name, parentFolderId: parentId }) });
        await onChanged(operation); setEditing({ kind, id: row.id, original: row.name, draft: row.name });
      }
    } catch (reason) { operation.fail(); onError(String(reason)); } finally { setCreating(false); }

});
}
  async function commit() {
return runOperation("canvas.rename", async (operation) => {
const canvasJson = operation.json;

    if (!editing) return;
    const pending = editing, name = pending.draft.trim(); setEditing(undefined);
    if (!name || name === pending.original) return;
    try { const url = pending.kind === "document" ? `/v1/canvases/${pending.id}` : `/v1/canvas-folders/${pending.id}`; await canvasJson(url, { method: "PATCH", body: JSON.stringify({ name }) }); await onChanged(operation); }
    catch (reason) { operation.fail(); onError(String(reason)); await onChanged(operation); }

});
}
  function keyDown(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setEditing(undefined); } }
  function editable(kind: Editing["kind"], id: string, name: string) {
    if (editing?.kind === kind && editing.id === id) return <Input className="h-7 flex-1 rounded-sm px-1" value={editing.draft} autoFocus onFocus={event => event.currentTarget.select()} onChange={event => setEditing({ ...editing, draft: event.target.value })} onKeyDown={keyDown} onBlur={() => void commit()} />;
    return <span className="min-w-0 flex-1 truncate" onDoubleClick={event => { event.stopPropagation(); setEditing({ kind, id, original: name, draft: name }); }}>{name}</span>;
  }
  function renderBranch(parentId: string | null = null, depth = 0): ReactNode[] {
    const branchFolders = folders.filter(folder => (folder.parentFolderId ?? null) === parentId), branchDocuments = documents.filter(document => (document.folderId ?? null) === parentId);
    return [...branchFolders.flatMap(folder => [<div key={`folder:${folder.id}`} className="group flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted" style={{ paddingInlineStart: `${8 + depth * 16}px` }} onDragOver={event => { if (dragging) event.preventDefault(); }} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (dragging) void move(dragging, folder.id, documents.filter(row => row.folderId === folder.id).length); }}><FolderIcon className="size-4 shrink-0" />{editable("folder", folder.id, folder.name)}<Button size="icon-xs" variant="ghost" aria-label={`Create document in ${folder.name}`} onClick={() => void create("document", folder.id)}><PlusIcon /></Button></div>, ...renderBranch(folder.id, depth + 1)]), ...branchDocuments.map(document => <div data-trace-target={traceTargets("canvas.move", "canvas.rename", "canvas.tree.rename")} key={document.id} draggable={!editing} onDragStart={event => { setDragging(document.id); event.dataTransfer.setData("text/plain", document.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(undefined)} onDragOver={event => { if (dragging && dragging !== document.id) event.preventDefault(); }} onDrop={event => { event.preventDefault(); event.stopPropagation(); const id = event.dataTransfer.getData("text/plain") || dragging; if (id && id !== document.id) void move(id, parentId, branchDocuments.filter(row => row.id !== id).findIndex(row => row.id === document.id)); }} className={`group flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted ${selectedId === document.id ? "bg-muted" : ""}`} style={{ paddingInlineStart: `${8 + depth * 16}px` }} onClick={() => onSelect(document.id)}><FileTextIcon className="size-4 shrink-0" />{editable("document", document.id, document.title)}<Button data-trace-target={traceTargets("canvas.remove")} size="icon-xs" variant="ghost" className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" aria-label={`Delete ${document.title}`} onClick={event => { event.stopPropagation(); setDeleting(document); }}><Trash2Icon /></Button></div>)];
  }
  return <aside data-trace-target={traceTargets("canvas.list")} data-trace-region={"canvas-tree"} className="w-64 shrink-0 border-r p-3"><DropdownMenu><DropdownMenuTrigger data-trace-target={traceTargets("canvas.create")} render={<Button data-trace-target={traceTargets("canvas.create")} className="mb-3 w-full" disabled={creating}><PlusIcon data-icon="inline-start" />New</Button>} /><DropdownMenuContent><DropdownMenuGroup><DropdownMenuItem onClick={() => void create("document")}><FileTextIcon />Document</DropdownMenuItem><DropdownMenuItem onClick={() => void create("folder")}><FolderIcon />Folder</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu><div className="flex flex-col gap-0.5">{renderBranch()}</div><div className="mt-2 min-h-8 rounded-md text-center text-xs text-muted-foreground" onDragOver={event => { if (dragging) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain") || dragging; if (id) void move(id, null, documents.filter(row => !row.folderId).length); }}>{dragging ? "Drop here to move to root" : ""}</div>{!documents.length && !folders.length && !error && <p className="px-2 py-8 text-center text-sm text-muted-foreground">Create a document or folder for people and Agents to edit together.</p>}{error && <p className="p-2 text-sm text-destructive">{error}</p>}<AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle><AlertDialogDescription>This removes the document from the Channel. The stored history is retained for recovery.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void remove()}>Delete document</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></aside>;
}
