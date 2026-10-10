import { traceTargets } from "@/api/trace-locators";
import { runOperation } from "@/api/operation-runner";
import { useEffect, useState, type ReactNode } from "react";
import { accountRealtime } from "@/api/realtime";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AgentMemberItem } from "@/features/messages/AgentMemberItem";
import { AgentWorkDrawer } from "@/features/agent/AgentWorkDrawer";
import { messageRequest } from "@/features/messages/api";
import type { AgentRequestStatus } from "@/features/messages/types";
import { useChannelContext } from "./ChannelContext";
import { ContextCapsule } from "./ContextCapsule";
import type { Blueprint } from "@/features/messages/types";
import type { Person } from "@/features/people/organization-people";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InviteSessionDialog, type SessionInvite } from "@/features/onboarding/InviteSessionDialog";
export function UserIdentityCard({ id, name, onGive, directoryPerson }: { id?: string; name: string; onGive?: (agent: Blueprint) => void; directoryPerson?: Person }) {
  const context = useChannelContext(),
    person = context?.people.find((row) => row.memberId === id || row.memberId === directoryPerson?.memberId ||
      (directoryPerson?.username ? row.username === directoryPerson.username : Boolean(directoryPerson?.email && row.email === directoryPerson.email)));
  const [requests, setRequests] = useState<AgentRequestStatus[]>([]),
    [work, setWork] = useState<AgentRequestStatus>();
  const [error, setError] = useState<string>();
  const [inviteError,setInviteError]=useState<string>();
  const [invite,setInvite]=useState<SessionInvite>();
  const [inviting,setInviting]=useState(false);
  const [added,setAdded]=useState(false);
  useEffect(()=>{setAdded(false);setInvite(undefined);},[id]);
  async function invitePerson() {
    if(!context || !directoryPerson)return;
    setInviting(true);setInviteError(undefined);
    try {
      // Membership may have changed since the message was written. Resolve it again
      // through the same authorized directory before choosing add versus invite.
      const rows=await messageRequest<Person[]>(`/v1/channels/${context.channelId}/organization/people?q=${encodeURIComponent(directoryPerson.username || directoryPerson.email)}`);
      const current=rows.find(row => directoryPerson.identity
        ? row.identity?.provider===directoryPerson.identity.provider && row.identity.subject===directoryPerson.identity.subject
        : row.userId && row.userId===directoryPerson.userId || row.memberId && row.memberId===directoryPerson.memberId || row.email===directoryPerson.email);
      const target=current ?? directoryPerson;
      if(current?.memberId){
        await messageRequest(`/v1/channels/${context.channelId}/members`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:target.email,identity:target.identity,role:"member"})});
        setAdded(true);
        await context.reloadPeople();
      }else{
        const result=await messageRequest<SessionInvite>(`/v1/channels/${context.channelId}/invite-links`,{method:"POST"});
        setInvite({...result,purpose:"join",channelName:context.channelName});
      }
    }catch(reason){setInviteError(String(reason));}finally{setInviting(false);}
  }
  useEffect(() => {
    if (!context || !person) return;
    let alive = true;
    const load = () => {
      void runOperation("members.identity.requests", async (operation) => {
        try { const rows=await operation.message<AgentRequestStatus[]>(`/v1/channels/${context.channelId}/agent-requests`); if (alive) {setRequests(rows);setError(undefined);} else operation.cancel(); }
        catch(reason) {operation.fail(); if(alive)setError(String(reason));}
      });
    };
    load();
    const off = accountRealtime.subscribe((frame) => {
      if (frame.channelId === context.channelId && frame.type.includes("agent"))
        load();
    });
    return () => {
      alive = false;
      off();
    };
  }, [context?.channelId, person?.memberId]);
  const agents =
      (id ? context?.agents.filter((row) => row.ownerMemberId === id) : []) ??
      [],
    assets =
      context?.resources.filter(
        (row) =>
          Boolean(id) &&
          row.contributorMemberId === id &&
          row.kind !== "message",
      ) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Avatar className="size-8"><AvatarImage src={person?.avatarUrl ?? directoryPerson?.avatarUrl}/><AvatarFallback>{name.slice(0,1)}</AvatarFallback></Avatar>
        <div><strong>{person?.displayName ?? name}</strong>
        <p className="text-sm text-muted-foreground">
          {person?.username ?? directoryPerson?.username ?? person?.email ?? directoryPerson?.email ?? "Channel member"}
        </p></div>
      </div>
      {!person && directoryPerson && <Button disabled={inviting || added} onClick={()=>void invitePerson()}>{inviting?"Inviting…":added?"Added to this Channel":"Invite to this Channel"}</Button>}
      {inviteError && <p role="alert" className="text-sm text-destructive">{inviteError}</p>}
      <InviteSessionDialog invite={invite} onClose={()=>setInvite(undefined)} onError={setInviteError}/>
      <div className="flex flex-col gap-1">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Unable to load tasks.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Agents in this Channel</p>
        {agents.map((agent) => (
          <AgentMemberItem
            key={agent.id}
            agent={agent}
            owner={
              person ?? {
                memberId: id ?? "",
                displayName: name,
                email: "",
                isCurrent: false,
                agentCount: agents.length,
              }
            }
            requests={requests}
            showWork={setWork}
            onGive={onGive}
          />
        ))}
        {!agents.length && (
          <p className="text-sm text-muted-foreground">No Agent shared here.</p>
        )}
      </div>
      <div className="flex max-h-48 flex-col items-start gap-1 overflow-y-auto">
        <p className="text-xs text-muted-foreground">Shared assets</p>
        {assets.map((row) => (
          <ContextCapsule
            key={`${row.kind}:${row.id}`}
            kind={row.kind}
            id={row.id}
            label={row.name}
          />
        ))}
        {!assets.length && (
          <p className="text-sm text-muted-foreground">
            No shared assets in this Channel.
          </p>
        )}
      </div>
      <AgentWorkDrawer
        request={requests.find((row) => row.id === work?.id) ?? work}
        open={Boolean(work)}
        onOpenChange={(open) => {
          if (!open) setWork(undefined);
        }}
      />
    </div>
  );
}
export function UserIdentity({
  id,
  name,
  children,
  className,
  onGive,
  directoryPerson,
}: {
  id?: string;
  directoryPerson?: Person;
  name: string;
  children: ReactNode;
  className?: string;
  onGive?: (agent: Blueprint) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger data-trace-target={traceTargets("members.identity.requests")}
        render={
          <span data-trace-target={traceTargets("members.identity.requests")} role="button" tabIndex={0} onMouseEnter={()=>setOpen(true)} onFocus={()=>setOpen(true)} className={className ?? "inline-flex cursor-pointer text-left"} onClick={(event) => event.stopPropagation()} />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4">
        <UserIdentityCard id={id} name={name} onGive={onGive} directoryPerson={directoryPerson} />
      </PopoverContent>
    </Popover>
  );
}
