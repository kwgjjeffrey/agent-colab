import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { prepareAvatar } from "./avatar-upload";
import { initials } from "@/features/messages/AgentAvatar";

export type AccountProfileData = {
  id: string; email: string; displayName?: string; avatarUrl?: string;
  nameCustomized: boolean; googleLinked: boolean;
};

export function needsAccountSetup(profile: AccountProfileData | undefined, googleDismissed: boolean) {
  return Boolean(profile && ((!profile.googleLinked && !profile.nameCustomized) || (!profile.googleLinked && !googleDismissed)));
}

export function isDeviceEmail(email: string) { return email.endsWith("@device.invalid"); }

export function AccountProfile({ profile, onSaved, onLinkGoogle, linking, onDismissGoogle, googleDismissed }: {
  profile: AccountProfileData | undefined;
  onSaved: (profile: AccountProfileData) => void;
  onLinkGoogle: () => void; linking: boolean;
  onDismissGoogle: () => void; googleDismissed: boolean;
}) {
  const [name, setName] = useState(profile?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const activeAccount = useRef(profile?.id);
  activeAccount.current = profile?.id;
  // Account changes reset the form; its own successful save must retain the confirmation.
  useEffect(() => { setName(profile?.displayName ?? ""); setError(""); setSaved(false); setAvatarStatus(""); setAvatarSaving(false); }, [profile?.id]);
  async function updateAvatar(file?: File) {
    const account = profile?.id;
    setAvatarSaving(true); setError(""); setAvatarStatus("");
    try {
      const body = file ? { avatarUrl: await prepareAvatar(file) } : { resetAvatar: true };
      if (activeAccount.current !== account) return;
      const response = await fetch("/v1/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("Could not save your avatar. Please try again.");
      const updated = await response.json();
      if (activeAccount.current !== account || updated.id !== account) return;
      onSaved(updated); setAvatarStatus("Avatar saved.");
    } catch (reason) { if (activeAccount.current === account) setError(String(reason)); }
    finally { if (activeAccount.current === account) setAvatarSaving(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/v1/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name.trim() }) });
      if (!response.ok) throw new Error("Could not save your name. Please try again.");
      onSaved(await response.json()); setSaved(true);
    } catch (reason) { setError(String(reason)); } finally { setSaving(false); }
  }
  if (!profile) return <p role="status" className="text-sm text-muted-foreground">Loading account…</p>;
  return <div className="flex flex-col gap-4">
    <FieldGroup><Field>
      <FieldLabel>Avatar</FieldLabel>
      <div className="flex items-center gap-3">
        <Avatar className="size-12"><AvatarImage src={profile.avatarUrl} alt="Your avatar" /><AvatarFallback>{initials(profile.displayName ?? profile.email)}</AvatarFallback></Avatar>
        <Button variant="outline" size="sm" disabled={saving || avatarSaving} onClick={() => picker.current?.click()}>{avatarSaving ? "Saving…" : "Upload photo"}</Button>
        {profile.avatarUrl && <Button variant="ghost" size="sm" disabled={saving || avatarSaving} onClick={() => void updateAvatar()}>Use initials</Button>}
        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload avatar" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void updateAvatar(file); }} />
      </div>
      {avatarStatus && <p role="status" className="text-sm text-muted-foreground">{avatarStatus}</p>}
    </Field></FieldGroup>
    <form onSubmit={event => void save(event)}><FieldGroup>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="account-display-name">Display name</FieldLabel>
        <Input id="account-display-name" value={name} onChange={event => { setName(event.target.value); setSaved(false); }} maxLength={80} required disabled={saving} aria-invalid={Boolean(error)} />
        <FieldDescription>This is how teammates see you in every Channel.</FieldDescription>
      </Field>
      <Button type="submit" disabled={saving || avatarSaving || !name.trim() || (profile.nameCustomized && name.trim() === profile.displayName)}>{saving ? "Saving…" : "Save name"}</Button>
    </FieldGroup></form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm text-muted-foreground">Name saved.</p>}
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2"><span className="text-sm font-medium">Google account</span><Badge variant="secondary">{profile.googleLinked ? "Linked" : "Not linked"}</Badge></div>
      {profile.googleLinked ? <p className="text-sm text-muted-foreground">{profile.email}</p> : <>
        <p className="text-sm text-muted-foreground">{isDeviceEmail(profile.email) ? "Your account was created with this device. This device signs you in automatically." : "You can sign in with your linked devices."} Link Google to sign in on other devices and recover access.</p>
        <p className="text-xs text-muted-foreground">Selecting a Google account already used in Colab switches to that account; accounts are not merged.</p>
        <Button variant="outline" disabled={linking || saving} onClick={onLinkGoogle}>{linking ? "Opening Google…" : "Link Google account"}</Button>
        {!googleDismissed && <Button variant="ghost" size="sm" onClick={onDismissGoogle}>Don’t remind me about Google</Button>}
      </>}
    </section>
  </div>;
}
