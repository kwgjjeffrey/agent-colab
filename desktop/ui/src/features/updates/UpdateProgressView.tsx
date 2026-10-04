import {Progress} from "@/components/ui/progress";
import type {UpdateProgress} from "./progress";

export function UpdateProgressView({progress}: {progress?: UpdateProgress}) {
  const received = progress?.received ?? 0, total = progress?.total ?? 0;
  const percent = total ? Math.min(100, received / total * 100) : null;
  const speed = progress?.bytesPerSecond ?? 0;
  const resume = progress?.resumedFrom ? ` · resumed at ${(progress.resumedFrom / 1048576).toFixed(1)} MB` : "";
  const detail = progress?.state === "verifying" ? `Verifying ${progress.artifact ?? "artifact"}…`
    : progress?.state === "installing" ? "Activating verified resources…"
    : progress?.restartRequired ? "Resources installed. Restart Local Core to activate them."
    : progress?.state === "completed" ? `${progress.artifact ?? "Artifact"} ready`
    : ["interrupted", "failed"].includes(progress?.state ?? "") ? progress?.error ?? `Update interrupted at ${(received / 1048576).toFixed(1)} MB; retry will resume.`
    : progress?.artifact ? `${percent?.toFixed(0)}% · ${(received / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB · ${(speed / 1024).toFixed(0)} KiB/s${progress.etaSeconds ? ` · about ${Math.max(1, Math.ceil(progress.etaSeconds / 60))} min left` : ""}${resume}`
    : "Preparing update…";
  return <div className="mt-2 flex flex-col gap-1" role="status">
    <Progress aria-label="Colab update progress" value={percent}/>
    {progress?.artifact && <p className="break-words text-xs text-muted-foreground">{progress.artifact}</p>}
    <p className="break-words text-xs text-muted-foreground">{detail}</p>
  </div>;
}
