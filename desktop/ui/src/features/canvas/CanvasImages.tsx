import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { trackedFetch } from '@/api/request-activity';
import { Button } from '@/components/ui/button';
const uploadKey = new PluginKey<DecorationSet>('canvas-image-uploads');
// Upload placeholders are local decorations: unfinished uploads never enter the shared replica.
const uploadPlugin = new Plugin<DecorationSet>({
 key: uploadKey,
 state: {
  init: () => DecorationSet.empty,
  apply(transaction, previous) {
   const jobs = transaction.getMeta(uploadKey) as Upload[] | undefined;
   if (!jobs) return previous.map(transaction.mapping, transaction.doc);
   return DecorationSet.create(transaction.doc, jobs.map(job => Decoration.widget(Math.min(job.position, transaction.doc.content.size), () => {
    const block = document.createElement('div');
    block.className = 'canvas-image-upload-placeholder';
    block.dataset.uploadId = job.id;
    block.setAttribute('role', 'status');
    block.setAttribute('contenteditable', 'false');
    block.setAttribute('aria-busy', String(job.busy));
    const skeleton = document.createElement('div'); skeleton.className = 'canvas-image-upload-skeleton';
    const label = document.createElement('span'); label.textContent = job.error ? 'Image upload failed — use Retry above.' : 'Uploading image…';
    block.append(skeleton, label); return block;
   }, { key: job.id + ':' + job.busy + ':' + (job.error ?? ''), side: 1 })));
  }
 },
 props: { decorations: state => uploadKey.getState(state) }
});
export const CanvasImage = Image.extend({ addProseMirrorPlugins() { return [...(this.parent?.() ?? []), uploadPlugin]; }, parseHTML() { return [{ tag: 'img[data-canvas-image]', getAttrs: element => /^[0-9a-f-]{36}$/.test(element.getAttribute('data-canvas-image') ?? '') ? null : false }]; }, addAttributes() { return { ...this.parent?.(), attachmentId: { default: null, parseHTML: element => element.getAttribute('data-canvas-image'), renderHTML: attributes => ({ 'data-canvas-image': attributes.attachmentId }) } }; } }).configure({ allowBase64: false, resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 64, minHeight: 64 } });
type Upload = { id: string; file: File; position: number; error?: string; busy: boolean };
export function CanvasImageUploads({ editor, canvasId }: { editor: Editor; canvasId: string }) {
 const [uploads, setUploads] = useState<Upload[]>([]);
 const jobs = useRef(new Map<string, Upload>()), abort = useRef(new AbortController()), input = useRef<HTMLInputElement>(null);
 function refresh() {
  const pending = [...jobs.current.values()];
  setUploads(pending);
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(uploadKey, pending).setMeta('addToHistory', false));
 }
 async function send(job: Upload) {
  job.busy = true; job.error = undefined; refresh();
  try {
   if (job.file.size > 20*1024*1024) throw new Error('Images must be smaller than 20 MB.');
   const response = await trackedFetch(`/v1/canvases/${canvasId}/images`, { method: 'POST', body: job.file, signal: abort.current.signal, headers: { 'Content-Type': job.file.type || 'application/octet-stream' } });
   if (!response.ok) throw new Error(await response.text());
   const image = await response.json() as { id: string };
   if (abort.current.signal.aborted || editor.isDestroyed) return;
   editor.chain().insertContentAt(Math.min(job.position, editor.state.doc.content.size), { type: 'image', attrs: { attachmentId: image.id, src: `/v1/canvas-images/${image.id}/content` } }).run();
   jobs.current.delete(job.id);
  } catch (error) { if (!abort.current.signal.aborted) job.error = error instanceof Error ? error.message : 'Image upload failed'; }
  finally { job.busy = false; if (!abort.current.signal.aborted) refresh(); }
 }
 function add(files: File[], position = editor.state.selection.from) {
  for (const file of files.filter(file => file.type.startsWith('image/'))) { const job = { id: crypto.randomUUID(), file, position, busy: true }; jobs.current.set(job.id, job); void send(job); }
 }
 useEffect(() => {
  const controller = new AbortController(); abort.current = controller;
  const dom = editor.view.dom;
  function paste(event: ClipboardEvent) { const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); event.stopImmediatePropagation(); add(files); } }
  function drop(event: DragEvent) { const files = [...(event.dataTransfer?.files ?? [])].filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); event.stopImmediatePropagation(); add(files, editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos); } }
  function map({ transaction }: { transaction: { mapping: { map(position: number): number } } }) { for (const job of jobs.current.values()) job.position = transaction.mapping.map(job.position); }
  editor.on('transaction', map); dom.addEventListener('paste', paste, true); dom.addEventListener('drop', drop, true);
  return () => { controller.abort(); editor.off('transaction', map); dom.removeEventListener('paste', paste, true); dom.removeEventListener('drop', drop, true); };
 }, [editor, canvasId]);
 return <div className="mx-auto max-w-4xl px-12 py-2"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={event => { add([...(event.target.files ?? [])]); event.target.value = ''; }} /><Button size="sm" variant="ghost" onClick={() => input.current?.click()}>Add image</Button>{uploads.map(job => <div key={job.id} role="status" className="flex items-center gap-3 py-2 text-sm"><span>{job.file.name}: {job.busy ? 'Uploading…' : job.error}</span>{job.error && <><Button size="sm" variant="outline" onClick={() => void send(job)}>Retry</Button><Button size="sm" variant="ghost" onClick={() => { jobs.current.delete(job.id); refresh(); }}>Dismiss</Button></>}</div>)}</div>;
}
