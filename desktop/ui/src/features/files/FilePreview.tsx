import { beginOperation, type Operation } from "@/api/telemetry";
import { operations } from "@/api/trace-operations";
import { runOperation } from "@/api/operation-runner";
import { useEffect, useRef, useState } from "react";
import { FileQuestionIcon, LoaderCircleIcon } from "lucide-react";
import { TextFilePreview, textFileExtensions as TEXT_EXTENSIONS, textFileType } from "./TextFilePreview";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const OFFICE_PREVIEW_LIMIT = 25 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "webp"]);

type Props = { shareId: string; path?: string; size?: number };
type PreviewState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "text"; content: string }
  | { kind: "native"; type: "image" | "pdf"; url: string }
  | { kind: "docx"; buffer: ArrayBuffer }
  | { kind: "sheet"; rows: string[][]; sheetName: string; truncated: boolean }
  | { kind: "unsupported"; message: string };

const extensionOf = textFileType;
const rawUrl = (shareId: string, path: string) =>
  `/v1/files/${shareId}/raw?path=${encodeURIComponent(path)}`;

/** Renderers are deliberately local-only: preview never uploads document contents to a third party. */
export function FilePreview({ shareId, path, size = 0 }: Props) {
  const [state, setState] = useState<PreviewState>({ kind: "empty" });
  const nativeOperation=useRef<Operation | undefined>(undefined);

  useEffect(() => {
    let active = true;
    if (!path) {
      setState({ kind: "empty" });
      return () => { active = false; };
    }
    const extension = extensionOf(path);
    if (IMAGE_EXTENSIONS.has(extension) || extension === "pdf") {
      const operation=beginOperation(operations["files.preview.native"]); nativeOperation.current=operation;
      setState({ kind: "native", type: extension === "pdf" ? "pdf" : "image", url: operation.nativeUrl(rawUrl(shareId,path)) });
      return () => { active=false; operation.finish("cancelled","view.closed"); if (nativeOperation.current===operation) nativeOperation.current=undefined; };
    }
    if (![...TEXT_EXTENSIONS, "docx", "xlsx"].includes(extension)) {
      setState({ kind: "unsupported", message: `Preview is not available for .${extension || "unknown"} files.` });
      return () => { active = false; };
    }
    if (["docx", "xlsx"].includes(extension) && size > OFFICE_PREVIEW_LIMIT) {
      setState({ kind: "unsupported", message: "This Office document is too large to preview safely. Give it to an Agent or open the synchronized local copy." });
      return () => { active = false; };
    }
    setState({ kind: "loading" });
    void (async () => {return runOperation("files.preview", async (operation)=>{
const trackedFetch=operation.fetch;

      try {
        if (TEXT_EXTENSIONS.has(extension)) {
          const response = await trackedFetch(`/v1/files/${shareId}/content?path=${encodeURIComponent(path)}`);
          if (!response.ok) throw new Error(await response.text());
          const value = await response.json() as { content: string };
          if (active) setState({ kind: "text", content: value.content });
          return;
        }
        const response = await trackedFetch(rawUrl(shareId, path));
        if (!response.ok) throw new Error(await response.text());
        const buffer = await response.arrayBuffer();
        if (!active) return;
        if (extension === "docx") {
          setState({ kind: "docx", buffer });
          return;
        }
        const ExcelJS = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error("This workbook has no worksheets.");
        const rows: string[][] = [];
        const rowLimit = Math.min(sheet.actualRowCount, 500);
        const columnLimit = Math.min(sheet.actualColumnCount, 100);
        for (let row = 1; row <= rowLimit; row += 1) {
          const values: string[] = [];
          for (let column = 1; column <= columnLimit; column += 1) {
            const value = sheet.getCell(row, column).value;
            values.push(value == null ? "" : typeof value === "object" && "text" in value ? String(value.text) : String(value));
          }
          rows.push(values);
        }
        setState({
          kind: "sheet",
          rows,
          sheetName: sheet.name,
          truncated: sheet.actualRowCount > rowLimit || sheet.actualColumnCount > columnLimit,
        });
      } catch (error) {operation.fail();
        if (active) setState({ kind: "unsupported", message: `Preview failed: ${error instanceof Error ? error.message : String(error)}` });
      }

});})();
    return () => { active = false; };
  }, [path, shareId, size]);

  if (state.kind === "empty") return <PreviewNotice message="Select a file from the tree to preview it." />;
  if (state.kind === "loading") return <PreviewNotice message="Loading preview…" loading />;
  if (state.kind === "unsupported") return <PreviewNotice message={state.message} />;
  if (state.kind === "native" && state.type === "image") {
    return <div className="flex size-full items-center justify-center overflow-auto bg-muted/20 p-8"><img onLoad={()=>nativeOperation.current?.finish("success","preview.loaded")} onError={()=>nativeOperation.current?.finish("error","preview.failed")} src={state.url} alt={path ?? ""} className="max-h-full max-w-full object-contain" /></div>;
  }
  if (state.kind === "native") return <iframe onLoad={()=>nativeOperation.current?.finish("success","preview.frame_loaded")} title={path} src={state.url} className="size-full border-0" />;
  if (state.kind === "docx") return <DocxPreview buffer={state.buffer} />;
  if (state.kind === "sheet") {
    return (
      <ScrollArea className="size-full">
        <div className="min-w-max p-4">
          <p className="mb-3 text-sm font-medium">{state.sheetName}{state.truncated ? " · Preview limited to 500 rows × 100 columns" : ""}</p>
          <table className="border-collapse text-sm">
            <tbody>{state.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex} className="max-w-80 border px-2 py-1 align-top whitespace-pre-wrap">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );
  }
  return <TextFilePreview key={`${shareId}:${path}`} content={state.content} path={path ?? ""} />;
}

function DocxPreview({ buffer }: { buffer: ArrayBuffer }) {
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!target.current) return;
    target.current.replaceChildren();
    void import("docx-preview")
      .then(({ renderAsync }) => renderAsync(buffer, target.current!, undefined, { inWrapper: true, breakPages: true }))
      .catch((reason) => setError(String(reason)));
  }, [buffer]);
  return error ? <PreviewNotice message={`Preview failed: ${error}`} /> : <ScrollArea className="size-full"><div ref={target} className="min-h-full bg-muted/20 p-6" /></ScrollArea>;
}

function PreviewNotice({ message, loading = false }: { message: string; loading?: boolean }) {
  return <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">{loading ? <LoaderCircleIcon className="animate-spin" /> : <FileQuestionIcon />}<p className="max-w-md text-sm">{message}</p></div>;
}
