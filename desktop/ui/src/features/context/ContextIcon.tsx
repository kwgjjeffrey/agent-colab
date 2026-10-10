import {
  FileArchiveIcon, FileAudioIcon, FileCode2Icon, FileImageIcon,
  FileJsonIcon, FileSpreadsheetIcon, FileTextIcon, FileVideoIcon,
  FileIcon, MessagesSquareIcon, NotebookTabsIcon, PanelTopIcon,
} from "lucide-react";
import { ItemIcon } from "@/features/workspace/ItemIcon";
import { AgentAvatar, MemberAvatar } from "@/features/messages/AgentAvatar";
import type { ResourceKind } from "./context-model";

export function FileTypeIcon(props:{name:string;className?:string}) { return <IdeFileIcon {...props}/>; }
export function ContextIcon({ kind, name, avatarUrl }: { kind: "agent" | "member" | ResourceKind; name: string; avatarUrl?: string }) {
  if (kind === "agent") return <AgentAvatar src={avatarUrl} name={name} className="size-5" />;
  if (kind === "member") return <MemberAvatar src={avatarUrl} name={name} className="size-5" />;
  if (kind === "files") return <FileTypeIcon name={name} />;
  if (kind === "skill") return <ItemIcon kind="skill" name={name} />;
  const Icon = kind === "session" ? NotebookTabsIcon : kind === "canvas" ? PanelTopIcon : MessagesSquareIcon;
  return <Icon aria-hidden="true" className="size-4 shrink-0" />;
}
import { IdeFileIcon } from "@/features/workspace/ItemIcon";
