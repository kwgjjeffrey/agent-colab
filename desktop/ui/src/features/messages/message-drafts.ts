import type { EditorNode } from './AgentMessageComposer';
const memory = new Map<string, EditorNode>();
const prefix = 'colab.message-draft.v1:';
/** Drafts stay local and are isolated by authenticated account and stable Channel ID. */
export function loadMessageDraft(key: string): EditorNode | undefined {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = localStorage.getItem(prefix + key);
    if (!raw) return;
    const doc = JSON.parse(raw);
    if (doc.type === 'doc' && Array.isArray(doc.content)) return doc;
  } catch { /* Unavailable storage must not prevent composition. */ }
}
export function saveMessageDraft(key: string, document?: EditorNode) {
  if (document) memory.set(key, document); else memory.delete(key);
  try {
    if (document) localStorage.setItem(prefix + key, JSON.stringify(document));
    else localStorage.removeItem(prefix + key);
  } catch { /* Keep the in-memory draft when browser storage is unavailable. */ }
}
