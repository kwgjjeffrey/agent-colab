import { UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChannelIcon } from "./ChannelIcon";

type Person = { memberId?: string; email: string; displayName?: string; avatarUrl?: string; status: string };
export function ChannelHeading({ channel, members, onEdit, onMembers }: {
  channel: {name: string; icon?: string | null; role: string}; members: Person[];
  onEdit: () => void; onMembers: () => void;
}) {
  const joined = members.filter(member => member.status === "joined");
  const canEdit = channel.role === "owner" || channel.role === "admin";
  return <div className="group/channel-heading flex min-w-0 items-center gap-3">
    <Avatar size="lg"><ChannelIcon icon={channel.icon} name={channel.name} /></Avatar>
    <h1 className="min-w-0 truncate text-xl font-semibold" title={channel.name}
      tabIndex={canEdit ? 0 : undefined}
      onDoubleClick={canEdit ? onEdit : undefined}
      onKeyDown={canEdit ? event => { if (event.key === "Enter") { event.preventDefault(); onEdit(); } } : undefined}
    >{channel.name}</h1>
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" className="h-auto shrink-0 p-1" aria-label="Channel members" onClick={onMembers} />}>
        <AvatarGroup>
          {joined.slice(0,3).map(member => <Avatar size="sm" key={member.memberId ?? member.email}><AvatarImage src={member.avatarUrl} alt="" /><AvatarFallback>{(member.displayName ?? "Member").trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join("")}</AvatarFallback></Avatar>)}
          {joined.length > 3 && <AvatarGroupCount>+{joined.length - 3}</AvatarGroupCount>}
          {!joined.length && <AvatarGroupCount><UsersIcon /></AvatarGroupCount>}
        </AvatarGroup>
      </TooltipTrigger>
      <TooltipContent>Members</TooltipContent>
    </Tooltip>
  </div>;
}
