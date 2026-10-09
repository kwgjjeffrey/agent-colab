import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const creationHints = {
  catalog: "Group and organize context documents.",
  canvas: "A shared document people and Agents can edit simultaneously.",
  session: "Share your local Agent conversation so teammates can help or explore it with their own Agents.",
  files: "Share your local files or directories.",
  skill: "Share a reusable Skill that teammates can install in their Agents.",
  quickShare: "Share Sessions and Files with teammates without adding them to the Channel.",
};

export function CreationHint({ kind, trigger, children }: { kind: keyof typeof creationHints; trigger: ReactElement; children: ReactNode }) {
  return <Tooltip><TooltipTrigger render={trigger}>{children}</TooltipTrigger><TooltipContent side="right">{creationHints[kind]}</TooltipContent></Tooltip>;
}
