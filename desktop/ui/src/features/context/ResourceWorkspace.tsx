import type { ReactNode } from "react";
import { MoreHorizontalIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { UserIdentity } from "./UserIdentity";

export function ResourceWorkspace({ title, description, count, action, children }: {
  title: string; description: string; count: number; action: ReactNode; children: ReactNode;
}) {
  return <section className="resource-workspace" aria-label={`${title} workspace`}>
    <header className="resource-workspace-header">
      <div><div className="resource-heading"><h2>{title}</h2><Badge variant="secondary">{count}</Badge></div><p>{description}</p></div>
      {count > 0 && <div className="resource-primary-action">{action}</div>}
    </header>
    <Separator />
    {children}
  </section>;
}

export function ResourceEmpty({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action: ReactNode }) {
  return <Empty className="min-h-[340px]">
    <EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>
    <EmptyContent>{action}</EmptyContent>
  </Empty>;
}

export type ResourceAction = { label: string; icon: ReactNode; trace?: string; destructive?: boolean; onClick: () => void };

/** Shared presentation only: callers retain their existing loading, ownership and prompt paths. */
export function ResourceRow({ id, name, icon, owner, source, updatedAt, updateLabel = "Last synced", status, onOpen, openLabel, trace, onGive, giveTrace, giveDisabled, busy, actions = [], trailing }: {
  id?: string; name: string; icon: ReactNode;
  owner: { id?: string; name: string; avatarUrl?: string; isMe: boolean };
  source?: string; updatedAt: string; updateLabel?: string; status?: ReactNode;
  onOpen: () => void; openLabel: string; trace?: string;
  onGive: () => void; giveTrace?: string; giveDisabled?: boolean; busy: boolean;
  actions?: ResourceAction[]; trailing?: ReactNode;
}) {
  const timestamp = new Date(updatedAt);
  const validTimestamp = !Number.isNaN(timestamp.getTime());
  return <article id={id} className="resource-row">
    <button type="button" className="resource-open" aria-label={`${openLabel}: ${name}`} data-trace-target={trace} onClick={onOpen}>
      <span className="resource-type-icon">{icon}</span>
      <span className="resource-title" title={name}>{name}</span>
    </button>
    <div className="resource-metadata">
      <UserIdentity id={owner.id} name={owner.name}><span className="resource-owner"><Avatar className="size-4"><AvatarImage src={owner.avatarUrl} alt="" /><AvatarFallback>{owner.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><span className="truncate">{owner.name}{owner.isMe ? " (me)" : ""}</span></span></UserIdentity>
      {source && <span className="resource-source">{source}</span>}
      <time className="resource-time" dateTime={validTimestamp ? timestamp.toISOString() : undefined} title={validTimestamp ? timestamp.toLocaleString() : updatedAt}>{updateLabel} {validTimestamp ? timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "time unavailable"}</time>
    </div>
    {status && <div className="resource-status">{status}</div>}
    <div className="resource-actions">
      {trailing}
      <Button variant="secondary" size="sm" disabled={busy || giveDisabled} onClick={onGive} data-trace-target={giveTrace}><SparklesIcon data-icon="inline-start" />Give to Agent</Button>
      {actions.length > 0 ? <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{actions.map(action => <DropdownMenuItem key={action.label} disabled={busy} variant={action.destructive ? "destructive" : "default"} data-trace-target={action.trace} onClick={action.onClick}>{action.icon}{action.label}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu> : <span className="size-7" aria-hidden="true" />}
    </div>
  </article>;
}
