import { Badge } from "@/components/ui/badge";

export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <Badge variant="destructive" className={className} aria-label={`${count} unread messages`}>
    {count > 99 ? "99+" : count}
  </Badge>;
}
