import { traceTargets } from "@/api/trace-locators";
import { useEffect, useMemo, useState } from "react";
import { FileIcon, FolderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/features/files/FilePreview";

export type LocalFileEntry = { path: string; name: string; kind: "directory" | "file"; size: number };

type Props = { shareId: string; shareName: string; entries: LocalFileEntry[]; onClose: () => void };

/** A drill-down workspace, separate from the Files collection list, mirrors an IDE's tree/content model. */
export function FileExplorer({ shareId, shareName, entries }: Props) {
  const firstFile = useMemo(() => entries.find((entry) => entry.kind === "file"), [entries]);
  const [selectedPath, setSelectedPath] = useState(firstFile?.path);
  useEffect(() => { setSelectedPath(firstFile?.path); }, [shareId, firstFile?.path]);
  const selected = entries.find((entry) => entry.path === selectedPath);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("colab:preview-path", {detail:{id:shareId,path:selectedPath}}));
    return () => { window.dispatchEvent(new CustomEvent("colab:preview-path", {detail:{id:shareId,path:undefined}})); };
  }, [shareId, selectedPath]);
  useEffect(() => {
    const navigate = (event:Event) => {
      const value=(event as CustomEvent<{id:string;path:string}>).detail;
      if(value.id===shareId) setSelectedPath(entries.find(entry=>entry.kind==="file" && (!value.path || entry.path.startsWith(value.path+"/")))?.path);
    };
    window.addEventListener("colab:preview-navigate",navigate);
    return ()=>window.removeEventListener("colab:preview-navigate",navigate);
  },[shareId,entries]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-trace-region="files-detail">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <ScrollArea className="border-r bg-muted/20">
          <div className="p-2" role="tree" aria-label={`${shareName} files`}>
            {entries.map((entry) => (
              <Button
                key={entry.path}
                variant={entry.path === selectedPath ? "secondary" : "ghost"}
                className="h-8 w-full justify-start px-2 font-normal"
                style={{ paddingLeft: `${8 + (entry.path.split("/").length - 1) * 14}px` }}
                disabled={entry.kind === "directory"}
                onClick={() => entry.kind === "file" && setSelectedPath(entry.path)}
              >
                {entry.kind === "directory" ? <FolderIcon data-icon="inline-start" /> : <FileIcon data-icon="inline-start" />}
                <span className="truncate">{entry.name}</span>
              </Button>
            ))}
          </div>
        </ScrollArea>
        <main data-trace-region={"file-preview"} data-trace-target={traceTargets("files.preview", "files.preview.native")} className="min-h-0 min-w-0"><FilePreview shareId={shareId} path={selected?.path} size={selected?.size} /></main>
      </div>
    </div>
  );
}
