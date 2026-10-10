import type { Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import type { ContextResource } from "./context-model";

/** Map the saved @ range through concurrent edits; never replace unrelated text. */
export async function createMention(editor: Editor, range: { from: number; to: number }, create: () => Promise<ContextResource | undefined>) {
  let { from, to } = range;
  let valid = true;
  const text = editor.state.doc.textBetween(from, to);
  const map = ({ transaction }: { transaction: Transaction }) => {
    const start = transaction.mapping.mapResult(from, 1), end = transaction.mapping.mapResult(to, -1);
    valid &&= !start.deletedAcross && !end.deletedAcross;
    from = start.pos; to = end.pos;
  };
  editor.on("transaction", map);
  try {
    const item = await create();
    if (!item || editor.isDestroyed || !valid || from > to || editor.state.doc.textBetween(from, to) !== text) return false;
    return editor.chain().focus().insertContentAt({ from, to }, [
      { type: "mention", attrs: { id: item.id, label: item.name, kind: item.kind, mentionId: crypto.randomUUID() } },
      { type: "text", text: " " },
    ]).run();
  } finally { editor.off("transaction", map); }
}
