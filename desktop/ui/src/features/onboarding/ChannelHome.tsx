import { useEffect, useState } from "react";
import { XIcon, ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RecentActivity } from "./RecentActivity";
import { CollaborationNetwork } from "./CollaborationNetwork";
import { homeTips, tipRoles } from "./home-tips";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TipFlow } from "./TipFlow";
import type { AgentTarget } from "@/features/agent/AgentPromptDialog";
import { HomeActions } from "./HomeActions";
import type { ComponentProps } from "react";
export { homeTips } from "./home-tips";

export function ChannelHome({
  accountId,
  onTry,
  busyTip,
  defaultAgent = "codex",
  installedAgents = {},
  actions,
}: {
  accountId: string;
  busyTip?: string;
  onTry: (id: string) => void;
  defaultAgent?: AgentTarget;
  installedAgents?: Record<string, { installed: boolean }>;
  actions?: Omit<ComponentProps<typeof HomeActions>, "defaultAgent" | "installedAgents">;
}) {
  const key = `colab:onboarding:${accountId}`;
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      return [];
    }
  });
  const [showAll, setShowAll] = useState(false);
  const [role, setRole] = useState<string[]>(["all"]);
  const [flow, setFlow] = useState<string>();
  const [ignored, setIgnored] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(
    () => {
      const preference = localStorage.getItem(`${key}:collapsed`);
      return preference === null ? !actions : preference !== "true";
    },
  );
  useEffect(() => {
    // Count distinct days of exposure, not renders/tab switches. Ignored tips stay recoverable.
    const visitKey = `${key}:visits`;
    const today = new Date().toISOString().slice(0, 10);
    let days: string[] = [];
    try {
      days = JSON.parse(localStorage.getItem(visitKey) ?? "[]");
    } catch {
      /* Fresh preference. */
    }
    if (!days.includes(today)) {
      days = [...days, today].slice(-4);
      localStorage.setItem(visitKey, JSON.stringify(days));
    }
    setIgnored(days.length >= 4);
  }, [key]);
  function dismiss(id: string) {
    const next = [...new Set([...hidden, id])];
    localStorage.setItem(key, JSON.stringify(next));
    setHidden(next);
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-8">
      <CollaborationNetwork />
      <RecentActivity />
      {actions && <HomeActions {...actions} defaultAgent={defaultAgent} installedAgents={installedAgents} />}
      <Collapsible
        open={tipsOpen}
        onOpenChange={(open) => {
          setTipsOpen(open);
          localStorage.setItem(`${key}:collapsed`, String(!open));
        }}
      >
        <div className="flex items-center justify-between">
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            <ChevronDownIcon
              data-icon="inline-start"
              className={tipsOpen ? undefined : "-rotate-90"}
            />
            Use cases
          </CollapsibleTrigger>
          {tipsOpen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show active use cases" : "View all use cases"}
            </Button>
          )}
        </div>
        <CollapsibleContent>
          <ToggleGroup aria-label="Use cases for your role" value={role} onValueChange={setRole} className="my-3 flex-wrap" size="sm">
            <ToggleGroupItem value="all">All roles</ToggleGroupItem>
            {tipRoles.map(label => <ToggleGroupItem key={label} value={label}>{label}</ToggleGroupItem>)}
          </ToggleGroup>
          <section className="flex flex-col" aria-label="Things to try">
            {homeTips
              .filter(
                (tip) => (showAll || (!ignored && !hidden.includes(tip.id))) && (!role.length || role.includes("all") || role.includes(tip.role)),
              )
              .map((tip, index) => (
                <div key={tip.id}>
                  {index > 0 && <Separator />}
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3"><Badge variant="role" data-role={tip.role} className="mt-0.5">{tip.role}</Badge><p className="min-w-0 text-sm">{tip.text}</p></div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(busyTip)}
                      onClick={() => ["switch-agent", "handoff-design", "get-unstuck"].includes(tip.id) ? onTry(tip.id) : setFlow(tip.id)}
                    >
                      {busyTip === tip.id ? "Checking…" : "Try"}
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                    {!hidden.includes(tip.id) && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Dismiss: ${tip.text}`}
                        onClick={() => dismiss(tip.id)}
                      >
                        <XIcon />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            {!showAll && ignored && (
              <p className="text-sm text-muted-foreground">
                Use cases are tucked away. Explore them anytime with “View all use
                cases”.
              </p>
            )}
            {!showAll && homeTips.every((tip) => hidden.includes(tip.id)) && (
              <p className="text-sm text-muted-foreground">
                You’re all set. Use “View all use cases” whenever you want to
                explore.
              </p>
            )}
          </section>
        </CollapsibleContent>
      </Collapsible>
      {flow && <TipFlow key={flow} id={flow} defaultAgent={defaultAgent} installedAgents={installedAgents} onClose={() => setFlow(undefined)} onMissingSessions={() => { setFlow(undefined); onTry("working-style"); }} onNavigate={id => { setFlow(undefined); onTry(id); }} />}
    </div>
  );
}

export function completeHomeTip(accountId: string, id: string) {
  const key = `colab:onboarding:${accountId}`;
  let hidden: string[] = [];
  try {
    hidden = JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    /* Fresh preference. */
  }
  localStorage.setItem(key, JSON.stringify([...new Set([...hidden, id])]));
}
