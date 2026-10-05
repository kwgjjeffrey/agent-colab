import {
  FileArchiveIcon, FileAudioIcon, FileCode2Icon, FileImageIcon,
  FileJsonIcon, FileSpreadsheetIcon, FileTextIcon, FileVideoIcon,
  FileIcon, MessagesSquareIcon, NotebookTabsIcon, PanelTopIcon,
} from "lucide-react";
import { AgentAvatar, MemberAvatar } from "@/features/messages/AgentAvatar";
import type { ResourceKind } from "./context-model";

export function FileTypeIcon({ name, className = "size-4 shrink-0" }: { name: string; className?: string }) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const Icon = extension && ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "avif"].includes(extension) ? FileImageIcon
    : extension && ["mp4", "mov", "webm", "mkv"].includes(extension) ? FileVideoIcon
    : extension && ["mp3", "wav", "m4a", "flac"].includes(extension) ? FileAudioIcon
    : extension && ["zip", "tar", "gz", "7z", "rar"].includes(extension) ? FileArchiveIcon
    : extension && ["csv", "xls", "xlsx", "ods"].includes(extension) ? FileSpreadsheetIcon
    : extension && ["json", "jsonl", "yaml", "yml"].includes(extension) ? FileJsonIcon
    : extension && ["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "sh", "css", "html"].includes(extension) ? FileCode2Icon
    : extension && ["md", "txt", "pdf", "doc", "docx", "rtf"].includes(extension) ? FileTextIcon
    : FileIcon;
  return <Icon aria-hidden="true" className={className} />;
}

export function ContextIcon({ kind, name, avatarUrl }: { kind: "agent" | "member" | ResourceKind; name: string; avatarUrl?: string }) {
  if (kind === "agent") return <AgentAvatar src={avatarUrl} name={name} className="size-5" />;
  if (kind === "member") return <MemberAvatar src={avatarUrl} name={name} className="size-5" />;
  if (kind === "files") return <FileTypeIcon name={name} />;
  const Icon = kind === "session" ? NotebookTabsIcon : kind === "canvas" ? PanelTopIcon : MessagesSquareIcon;
  return <Icon aria-hidden="true" className="size-4 shrink-0" />;
}
