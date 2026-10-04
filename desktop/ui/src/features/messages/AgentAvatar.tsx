import { SparklesIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Agents inherit their owner's identity while the ring prevents them being mistaken for a person. */
export function AgentAvatar({src,name,className="size-6"}:{src?:string;name:string;className?:string}){
  return <span className="relative inline-flex shrink-0 rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 p-[2px]">
    <Avatar className={cn("border border-background",className)}><AvatarImage src={src}/><AvatarFallback className="text-[9px]">{initials(name)}</AvatarFallback></Avatar>
    <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-violet-600 text-white shadow-sm"><SparklesIcon className="size-3"/></span>
  </span>
}

/** People and Agents share the same framed silhouette; only Agents add the supernova marker. */
export function MemberAvatar({src,name,className="size-6"}:{src?:string;name:string;className?:string}){
  return <span className="shrink-0 rounded-full border-2 border-emerald-500 bg-background p-[1px]">
    <Avatar className={className}><AvatarImage src={src}/><AvatarFallback className="text-[9px]">{initials(name)}</AvatarFallback></Avatar>
  </span>
}

export function initials(value:string){return value.split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join("")||"?"}
