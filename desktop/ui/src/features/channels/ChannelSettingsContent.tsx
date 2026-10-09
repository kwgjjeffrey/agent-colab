import { FormEvent, useEffect, useState } from "react";
import { runOperation } from "@/api/operation-runner";
import { traceTargets } from "@/api/trace-locators";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2Icon } from "lucide-react";
import { ChannelIconPicker } from "./ChannelIcon";
import { isDeviceEmail } from "@/features/account/AccountProfile";
import { type AgentTarget } from "@/features/agent/AgentPromptDialog";
type Channel = {id: string; name: string; icon?: string | null; role: string};
type Member = {memberId?: string; email: string; displayName?: string; avatarUrl?: string; role: string; status: "joined" | "pending"};
type OrganizationPerson = {userId: string; email: string; displayName?: string};
function initials(name: string) { return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join("") || "C"; }

export function ChannelSettingsContent({
  mode,
  channel,
  members,
  busy,
  onSave,
  onAdd,
  onLoad,
  onRole,
  onRemove,
  onInvite,
  inviteBusy,
  defaultAgent,
  installedAgents,
  onRefresh,
}: {
  mode: "identity" | "members";
  channel: Channel;
  members: Member[];
  busy: boolean;
  onSave: (e: FormEvent<HTMLFormElement>) => void;
  onAdd: (e: FormEvent<HTMLFormElement>) => void;
  onLoad: () => void;
  onRole: (m: Member, r: string) => void;
  onRemove: (m: Member) => void;
  onInvite: () => void;
  inviteBusy: boolean;
  defaultAgent: AgentTarget;
  installedAgents: Record<string, { installed: boolean }>;
  onRefresh: () => Promise<void>;
}) {
  const [people, setPeople] = useState<OrganizationPerson[]>([]);
  const [iconPreparing, setIconPreparing] = useState(false);
  useEffect(() => { if (mode === "members") onLoad(); }, [channel.id, mode]);
  useEffect(() => {
    if (mode !== "identity") return;
    let pending = false;
    const reconcile = () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      void onRefresh().finally(() => { pending = false; });
    };
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [channel.id, mode, onRefresh]);
  async function searchPeople(query: string) {
return runOperation("members.search", async (operation) => {
const trackedFetch = operation.fetch;

    if (!query.trim()) {
      setPeople([]);
      return;
    }
    try {
      const response = await trackedFetch(
        `/v1/channels/${channel.id}/organization/people?q=${encodeURIComponent(query)}`,
      );
      if (response.ok) setPeople(await response.json());
    } catch {
      /* Search is progressive enhancement. */
    }

});
}
  const canManage = channel.role === "owner" || channel.role === "admin";
  return (
    <div className="flex flex-col gap-4">
      {mode === "identity" && <section className="flex flex-col gap-4">
        <form data-trace-target={traceTargets("channels.update")} onSubmit={onSave}>
          <FieldGroup>
            <div className="grid grid-cols-1 gap-4">
              <Field>
                <FieldLabel htmlFor="channel-name">Name</FieldLabel>
                <Input
                  id="channel-name"
                  name="name"
                  defaultValue={channel.name}
                  disabled={!canManage}
                />
              </Field>
              <Field>
                <FieldLabel>Icon</FieldLabel>
                <ChannelIconPicker key={channel.id} channelId={channel.id} icon={channel.icon} name={channel.name} defaultAgent={defaultAgent} installedAgents={installedAgents} disabled={!canManage || busy} onPreparing={setIconPreparing} />
              </Field>
            </div>
            {canManage && (
              <Button type="submit" disabled={busy || iconPreparing} className="w-fit">
                Save changes
              </Button>
            )}
          </FieldGroup>
        </form>
      </section>}
      {mode === "members" && <section className="flex flex-col gap-4">
        {canManage && <Button variant="outline" className="w-fit" disabled={busy || inviteBusy} onClick={onInvite}>{inviteBusy ? "Creating invitation…" : "Invite via Agent"}</Button>}
        {canManage && (
          <form data-trace-target={traceTargets("members.add", "members.search")} onSubmit={onAdd}>
            <FieldGroup>
              <div className="flex items-end gap-3">
                <Field className="flex-1">
                  <FieldLabel>Person or email</FieldLabel>
                  <Input
                    name="email"
                    type="email"
                    list={`organization-people-${channel.id}`}
                    required
                    placeholder="name@company.com"
                    onChange={(event) =>
                      void searchPeople(event.currentTarget.value)
                    }
                  />
                  <datalist id={`organization-people-${channel.id}`}>
                    {people.map((person) => (
                      <option key={person.userId} value={person.email}>
                        {person.displayName ?? person.email}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field className="w-32">
                  <FieldLabel>Role</FieldLabel>
                  <Select name="role" defaultValue="member">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? "Adding…" : "Add member"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}
        <div className="divide-y rounded-xl border">
          {members.map((member) => (
            <div
              key={member.memberId ?? member.email}
              className="flex items-center gap-3 p-3"
            >
              <Avatar>
                <AvatarImage src={member.avatarUrl} />
                <AvatarFallback>
                  {initials(member.displayName ?? member.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.displayName ?? member.email}
                </p>
                {!isDeviceEmail(member.email) && <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>}
              </div>
              {member.status === "pending" && (
                <Badge variant="outline">Invitation pending</Badge>
              )}
              {channel.role === "owner" &&
              member.role !== "owner" &&
              member.memberId ? (
                <Select
                  value={member.role}
                  onValueChange={(value) => onRole(member, value as string)}
                >
                  <SelectTrigger data-trace-target={traceTargets("members.role")} size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary">{member.role}</Badge>
              )}
              {channel.role === "owner" && member.role !== "owner" && (
                <Button data-trace-target={traceTargets("members.remove")}
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${member.displayName ?? member.email}`}
                  onClick={() => onRemove(member)}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>}
    </div>
  );
}
