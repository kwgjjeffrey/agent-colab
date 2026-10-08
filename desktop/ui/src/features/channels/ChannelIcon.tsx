import { useRef, useState } from "react";
import { createAvatar } from "@dicebear/core";
import { shapes } from "@dicebear/collection";
import { Button } from "@/components/ui/button";

export function generatedChannelIcon(seed: string) {
  return createAvatar(shapes, { seed, size: 128 }).toDataUri();
}
export function ChannelIcon({ icon, name }: { icon?: string | null; name: string }) {
  const source = icon?.startsWith("data:image/") || icon?.startsWith("https://") ? icon : generatedChannelIcon(name);
  return <img src={source} alt="" className="size-full rounded-full object-cover" />;
}
export async function readChannelIcon(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the image.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 128, 128);
    return canvas.toDataURL("image/png");
  } finally { bitmap.close(); }
}
export function ChannelIconPicker({ icon, name, disabled, onPreparing }: { icon?: string | null; name: string; disabled: boolean; onPreparing?: (preparing: boolean) => void }) {
  const [value, setValue] = useState(icon ?? generatedChannelIcon(name));
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return <div className="flex flex-col gap-2">
    <input type="hidden" name="icon" value={value} />
    <div className="flex items-center gap-3"><div className="size-12 shrink-0"><ChannelIcon icon={value} name={name} /></div><div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant="outline" disabled={disabled || loading} onClick={() => input.current?.click()}>{loading ? "Preparing…" : "Upload image"}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={disabled || loading} onClick={() => { setValue(generatedChannelIcon(crypto.randomUUID())); setError(undefined); }}>Generate icon</Button>
    </div></div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Channel icon image" disabled={disabled || loading} onChange={async event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
      if (!file) return;
      setLoading(true); onPreparing?.(true); setError(undefined);
      try { setValue(await readChannelIcon(file)); } catch (reason) { setError(String(reason)); } finally { setLoading(false); onPreparing?.(false); }
    }} />
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
