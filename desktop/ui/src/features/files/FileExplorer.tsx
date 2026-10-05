import { traceTargets } from "@/api/trace-locators";
import { useMemo, useState } from "react";
import { ArrowLeftIcon, FileIcon, FolderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/features/files/FilePreview";

export type LocalFileEntry = { path: string; name: string; kind: "directory" | "file"; size: number };

type Props = { shareId: string; shareName: string; entries: LocalFileEntry[]; onClose: () => void };

/** A drill-down workspace, separate from the Files collection list, mirrors an IDE's tree/content model. */
export function FileExplorer({ shareId, shareName, entries, onClose }: Props) {
  const firstFile = useMemo(() => entries.find((entry) => entry.kind === "file"), [entries]);
  const [selectedPath, setSelectedPath] = useState(firstFile?.path);
  const selected = entries.find((entry) => entry.path === selectedPath);
  const segments = selectedPath?.split("/") ?? [];

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="icon" aria-label="Back to shared files" onClick={onClose}><ArrowLeftIcon /></Button>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbPage>{shareName}</BreadcrumbPage></BreadcrumbItem>
            {segments.map((segment, index) => <span className="contents" key={`${segment}-${index}`}><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{segment}</BreadcrumbPage></BreadcrumbItem></span>)}
          </BreadcrumbList>
        </Breadcrumb>
      </header>
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
