import type { ComponentProps } from "react";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Agent handoffs share one visual identity, independent of manual primary actions. */
export function AgentButton({ children, ...props }: Omit<ComponentProps<typeof Button>, "variant">) {
  return <Button {...props} variant="agent" data-agent-action="true"><SparklesIcon aria-hidden="true" data-agent-icon="supernova" data-icon="inline-start" />{children}</Button>;
}
