import manifest from "material-icon-theme/dist/material-icons.json";
import { FolderIcon, FolderSyncIcon, MessagesSquareIcon, SparklesIcon, FileTextIcon } from "lucide-react";

const icons = import.meta.glob<string>("/node_modules/material-icon-theme/icons/*.svg", { eager: true, query: "?url", import: "default" });
export function IdeFileIcon({name,className="size-4 shrink-0"}:{name:string;className?:string}) {
  const key=name.toLowerCase();
  const theme=manifest as {fileNames:Record<string,string>;fileExtensions:Record<string,string>;iconDefinitions:Record<string,{iconPath:string}>;file:string};
  const extensions=key.split(".").slice(1).map((_,index)=>key.split(".").slice(index+1).join("."));
  const id=theme.fileNames[key] ?? extensions.map(extension=>theme.fileExtensions[extension]).find(Boolean) ?? theme.file;
  const file=theme.iconDefinitions[id]?.iconPath.split("/").at(-1) ?? "file.svg";
  return <img alt="" aria-hidden="true" className={className} src={icons[`/node_modules/material-icon-theme/icons/${file}`]} />;
}
export function ItemIcon({kind,name}:{kind:string;name:string}) {
  if(kind==="files" && name.includes(".")) return <IdeFileIcon name={name}/>;
  const Icon=kind==="catalog"?FolderIcon:kind==="files"?FolderSyncIcon:kind==="session"?MessagesSquareIcon:kind==="skill"?SparklesIcon:FileTextIcon;
  return <Icon aria-hidden="true" className={`size-4 shrink-0 item-icon-${kind}`} />;
}
