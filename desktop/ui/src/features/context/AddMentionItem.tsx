import { PlusIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ItemIcon } from "@/features/workspace/ItemIcon";

export type MentionItemKind = "session" | "files" | "skill";

/** The standard menu owns hover bridging and keyboard navigation, not editor focus. */
export function AddMentionItem({ onChoose }: { onChoose: (kind: MentionItemKind) => void }) {
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger openOnHover render={<Button type="button" variant="ghost" className="w-full justify-start" />}>
      <PlusIcon data-icon="inline-start" />Add new item
    </DropdownMenuTrigger>
    <DropdownMenuContent side="right" align="start" className="w-44">
      <DropdownMenuGroup>
        {([['session', 'Sessions'], ['files', 'Files'], ['skill', 'Skills']] as const).map(([kind, label]) =>
          <DropdownMenuItem key={kind} onClick={() => onChoose(kind)}><ItemIcon kind={kind} name={label} />{label}</DropdownMenuItem>)}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
