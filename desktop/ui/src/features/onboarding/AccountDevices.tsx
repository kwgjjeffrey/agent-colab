import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
type Device = { id: string; name: string; current: boolean; boundAt: string; lastUsedAt?: string };

export function AccountDevices({ onError, onChanged }: { onError: (message: string) => void; onChanged: () => void }) {
  const [devices, setDevices] = useState<Device[]>();
  const [busy, setBusy] = useState<string>();
  const [confirm, setConfirm] = useState<Device>();
  async function load() {
    const response = await fetch("/v1/auth/devices");
    if (!response.ok) throw new Error(await response.text());
    setDevices(await response.json());
  }
  useEffect(() => { void load().catch(reason => onError(String(reason))); }, []);
  async function unlink(device: Device) {
    setBusy(device.id);
    try {
      const response = await fetch(`/v1/auth/devices/${device.id}`, { method: "DELETE" });
      if (response.status === 409) throw new Error("Link Google or another device before unlinking this account’s last device credential.");
      if (!response.ok) throw new Error(await response.text());
      setConfirm(undefined);
      if (device.current) onChanged(); else await load();
    } catch (reason) { onError(String(reason)); } finally { setBusy(undefined); }
  }
  return <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Devices can sign in to this account. Keep Google linked to recover access if a device is lost.</p>{devices ? devices.map(device => <div key={device.id} className="flex items-center gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{device.name}{device.current ? " · This device" : ""}</p><p className="text-xs text-muted-foreground">Linked {new Date(device.boundAt).toLocaleDateString()}</p></div><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirm(device)}>{busy === device.id ? "Unlinking…" : "Unlink"}</Button></div>) : <p role="status" className="text-sm">Loading devices…</p>}<AlertDialog open={Boolean(confirm)} onOpenChange={open=>{if(!open&&!busy)setConfirm(undefined);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Unlink {confirm?.name}?</AlertDialogTitle><AlertDialogDescription>This device will no longer automatically sign in to this account. You must retain another credential to avoid losing access.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(busy)}>Cancel</AlertDialogCancel><AlertDialogAction disabled={Boolean(busy)} onClick={()=>{if(confirm)void unlink(confirm);}}>{busy?"Unlinking…":"Unlink"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
