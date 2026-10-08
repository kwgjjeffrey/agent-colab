import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export type SessionInvite = { id: string; token: string; url: string; expiresAt: string; purpose?: "join"; channelName?: string };
export function InviteSessionDialog({ invite, onClose, onError }: { invite?: SessionInvite; onClose: () => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [invite?.id]);
  if (!invite) return null;
  const prompt = invite.purpose === "join" ? channelInvitationPrompt(invite) : `Please share a relevant Agent conversation with this Colab Channel. You choose what to share; do not upload any Session automatically.

If Agent Colab is not installed for your coding Agent, download https://github.com/kwgjjeffrey/agent-colab/releases/latest/download/colab-install into a temporary directory, inspect it, then run bash ./colab-install --agent <codex|claude|myflicker>, choosing your own Agent. The installer verifies the release and installs/starts Local Core. If already installed, update Colab first so the invitation command is available. Do not change an unrelated Agent target.

Then run the installed Skill's bin/colab-open --invitation '${invite.token}'. This opens your local GUI, asks you to select an account if necessary, joins the Channel as an ordinary member, and opens the Session picker. Please select the Session you want to share.

You can also open Colab directly: colab://join?token=${encodeURIComponent(invite.token)}&action=share-session
Installation fallback and invitation: ${invite.url}

This invitation expires ${invitationExpiry(invite.expiresAt).toLocaleString()}. Only share content you intend Channel members to access.`;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="sm:max-w-2xl"><DialogHeader className="pr-10"><DialogTitle>{invite.purpose === "join" ? "Invite to Channel" : "Invite teammates to share a Session"}</DialogTitle><DialogDescription>{invite.purpose === "join" ? "Send this prompt to a collaborator's Agent. It prepares Colab and joins this Channel. Anyone with this invitation can join as a member for 24 hours." : "No other member has shared a Session yet. Send this prompt to a teammate; their Agent can open the share picker. Invitation expires in 24 hours."}</DialogDescription></DialogHeader><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">{prompt}</pre><DialogFooter><Button variant="outline" disabled={busy} onClick={() => {setBusy(true);void fetch(`/v1/invite-links/${invite.id}`,{method:"DELETE"}).then(async response=>{if(!response.ok)throw new Error(await response.text());onClose();}).catch(reason=>onError(String(reason))).finally(()=>setBusy(false));}}>Revoke invitation</Button><Button onClick={() => void navigator.clipboard.writeText(prompt).then(()=>setCopied(true)).catch(reason => onError(String(reason)))}>{copied?"Copied. Send it to your collaborator":"Copy prompt"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function channelInvitationPrompt(invite: SessionInvite) {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const installUrl = import.meta.env.VITE_COLAB_INSTALL_URL || "https://artifacts.agent-colab.zhiyuanwangluo.online/install/colab-install";
  const script = `curl --noproxy '*' -fsSL --retry 3 --connect-timeout 10 ${quote(installUrl)} | bash -s -- --with-app --invitation ${quote(invite.token)}`;
  return `Please join the Agent Colab Channel ${JSON.stringify(invite.channelName)} on this device. Run this single command on macOS:\n\n${`bash -o pipefail -c ${quote(script)}`}\n\nIt verifies and installs Agent Colab Skill, Local Core and GUI, installs the macOS app if missing, starts the local service, and signs in or registers through the device credential before joining. Existing accounts and data are preserved. If account selection is required, ask me which account to use; never guess. Do not share any files or Sessions automatically.\n\nInvitation expires ${invitationExpiry(invite.expiresAt).toLocaleString()}.`;
}

function invitationExpiry(value: string) {
  return new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
}
