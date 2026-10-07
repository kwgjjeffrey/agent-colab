import { ContextCapsule } from "./ContextCapsule";
import { AgentIdentityLink } from "./AgentIdentityLink";
import { UserIdentity } from "./UserIdentity";
import { isResourceKind } from "./context-model";
import { useChannelContext } from "./ChannelContext";

/** Every surface uses the same object identity and Profile interaction. */
export function MentionCapsule({
  kind,
  id,
  label,
  currentMemberId,
}: {
  kind?: string;
  id?: string;
  label: string;
  currentMemberId?: string;
}) {
  const context = useChannelContext();
  currentMemberId ??= context?.people?.find(person => person.isCurrent)?.memberId;
  if (isResourceKind(kind))
    return <ContextCapsule kind={kind} id={id ?? ""} label={label} />;
  if (kind === "member")
    return (
      <UserIdentity id={id} name={label}>
        <span
          className={`member-mention ${id && id === currentMemberId ? "member-mention-me" : ""}`}
        >
          @{label}
        </span>
      </UserIdentity>
    );
  return (
    <AgentIdentityLink id={id} label={label}>
      <span className="agent-mention" data-mention-kind="agent">
        @{label}
      </span>
    </AgentIdentityLink>
  );
}
