import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ContextCapsule } from "./ContextCapsule";
import { AgentIdentityLink } from "./AgentIdentityLink";
import { UserIdentity } from "./UserIdentity";
import { isResourceKind } from "./context-model";
export function ContextMentionNode({ node }: NodeViewProps) {
  const { id, label, kind } = node.attrs;
  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      {isResourceKind(kind) ? (
        <ContextCapsule kind={kind} id={id} label={label} />
      ) : kind === "member" ? (
        <UserIdentity id={id} name={label}>
          <span className="member-mention">@{label}</span>
        </UserIdentity>
      ) : (
        <AgentIdentityLink id={id} label={label}>
          <span className="agent-mention">@{label}</span>
        </AgentIdentityLink>
      )}
    </NodeViewWrapper>
  );
}
