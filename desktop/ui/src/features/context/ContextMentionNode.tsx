import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { MentionCapsule } from "./MentionCapsule";
export function ContextMentionNode({ node }: NodeViewProps) {
  const { id, label, kind } = node.attrs;
  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      <MentionCapsule kind={kind} id={id} label={label} />
    </NodeViewWrapper>
  );
}
