import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
  useEffect(() => { setName(profile?.displayName ?? ""); setError(""); setSaved(false); }, [profile?.id, profile?.displayName]);
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
    <form onSubmit={event => void save(event)}><FieldGroup>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="account-display-name">Display name</FieldLabel>
        <Input id="account-display-name" value={name} onChange={event => { setName(event.target.value); setSaved(false); }} maxLength={80} required disabled={saving} aria-invalid={Boolean(error)} />
        <FieldDescription>This is how teammates see you in every Channel.</FieldDescription>
      </Field>
      <Button type="submit" disabled={saving || !name.trim() || (profile.nameCustomized && name.trim() === profile.displayName)}>{saving ? "Saving…" : "Save name"}</Button>
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
