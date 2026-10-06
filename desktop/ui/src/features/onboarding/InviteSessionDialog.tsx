import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export type SessionInvite = { id: string; token: string; url: string; expiresAt: string };
export function InviteSessionDialog({ invite, onClose, onError }: { invite?: SessionInvite; onClose: () => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [invite?.id]);
  if (!invite) return null;
  const prompt = `Please share a relevant Agent conversation with this Colab Channel. You choose what to share; do not upload any Session automatically.

If Agent Colab is not installed for your coding Agent, download https://github.com/kwgjjeffrey/agent-colab/releases/latest/download/colab-install into a temporary directory, inspect it, then run bash ./colab-install --agent <codex|claude|myflicker>, choosing your own Agent. The installer verifies the release and installs/starts Local Core. If already installed, update Colab first so the invitation command is available. Do not change an unrelated Agent target.

Then run the installed Skill's bin/colab-open --invitation '${invite.token}'. This opens your local GUI, asks you to select an account if necessary, joins the Channel as an ordinary member, and opens the Session picker. Please select the Session you want to share.

You can also open Colab directly: colab://join?token=${encodeURIComponent(invite.token)}&action=share-session
Installation fallback and invitation: ${invite.url}

This invitation expires ${new Date(invite.expiresAt).toLocaleString()}. Only share content you intend Channel members to access.`;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="sm:max-w-2xl"><DialogHeader className="pr-10"><DialogTitle>Invite teammates to share a Session</DialogTitle><DialogDescription>No other member has shared a Session yet. Send this prompt to a teammate; their Agent can open the share picker. Invitation expires in 24 hours.</DialogDescription></DialogHeader><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">{prompt}</pre><DialogFooter><Button variant="outline" disabled={busy} onClick={() => {setBusy(true);void fetch(`/v1/invite-links/${invite.id}`,{method:"DELETE"}).then(async response=>{if(!response.ok)throw new Error(await response.text());onClose();}).catch(reason=>onError(String(reason))).finally(()=>setBusy(false));}}>Revoke invitation</Button><Button onClick={() => void navigator.clipboard.writeText(prompt).then(()=>setCopied(true)).catch(reason => onError(String(reason)))}>{copied?"Copied":"Copy prompt"}</Button></DialogFooter></DialogContent></Dialog>;
}
