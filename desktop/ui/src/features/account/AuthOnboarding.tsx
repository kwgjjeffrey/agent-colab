import { Button } from "@/components/ui/button";
import type { AccountProfileData } from "./AccountProfile";
import type { ArtifactConfig } from "@/artifact-config";

export function hasBoundAuth(profile: AccountProfileData) {
  // Managed profiles are readable only after the Server validates an enterprise SSO lease.
  // Custom names, avatars and reminder preferences do not prove identity binding.
  return profile.googleLinked || profile.profileManaged === true;
}

export function AuthOnboarding({resolved, authenticated, profile, userId, config, busy, onAuthenticate}: {
  resolved: boolean; authenticated: boolean; profile?: AccountProfileData; userId?: string;
  config: ArtifactConfig; busy: boolean; onAuthenticate: () => void;
}) {
  if (!resolved || (authenticated && (!profile || profile.id !== userId)) || (authenticated && profile && profile.id === userId && hasBoundAuth(profile))) return null;
  return <div role="region" aria-label="Identity verification" className="flex shrink-0 items-center gap-3 border-b bg-primary/10 px-4 py-2">
    <p className="min-w-0 flex-1 text-sm">Verify your identity so teammates know who you are.</p>
    <Button size="sm" disabled={busy} onClick={onAuthenticate}>{busy ? "Opening sign-in…" : `Verify with ${config.auth.label}`}</Button>
  </div>;
}
