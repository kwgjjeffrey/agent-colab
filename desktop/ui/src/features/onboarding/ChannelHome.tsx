import { useEffect, useState } from "react";
import { XIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const homeTips = [
  { id: "switch-agent", text: "Agent quota exhausted? Share your conversation and continue with another Agent." },
  { id: "handoff-design", text: "Design ready? Hand the full Agent conversation to a collaborator to implement and verify." },
  { id: "working-style", text: "Understand teammates’ Agent working style by exploring their shared conversations." },
] as const;

export function ChannelHome({ accountId, onTry, onNavigate, busyTip }: {
  accountId: string;
  busyTip?: string;
  onTry: (id: string) => void;
  onNavigate: (tab: string) => void;
}) {
  const key = `colab:onboarding:${accountId}`;
  const [hidden, setHidden] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
  });
  const [showAll, setShowAll] = useState(false);
  const [ignored, setIgnored] = useState(false);
  useEffect(() => {
    // Count distinct days of exposure, not renders/tab switches. Ignored tips stay recoverable.
    const visitKey = `${key}:visits`;
    const today = new Date().toISOString().slice(0, 10);
    let days: string[] = [];
    try { days = JSON.parse(localStorage.getItem(visitKey) ?? "[]"); } catch { /* Fresh preference. */ }
    if (!days.includes(today)) { days = [...days, today].slice(-4); localStorage.setItem(visitKey, JSON.stringify(days)); }
    setIgnored(days.length >= 4);
  }, [key]);
  function dismiss(id: string) {
    const next = [...new Set([...hidden, id])];
    localStorage.setItem(key, JSON.stringify(next));
    setHidden(next);
  }
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-8">
    <header><h2 className="text-2xl font-semibold">Keep work moving between people and Agents</h2><p className="mt-2 text-muted-foreground">Share the conversation, not just a summary. Your next Agent can pick up the context and continue.</p></header>
    <section className="flex flex-col gap-3" aria-label="Things to try">
      <div className="flex items-center justify-between"><h3 className="font-medium">Things to try</h3><Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Show active tips" : "View all use cases"}</Button></div>
      {homeTips.filter(tip => showAll || (!ignored && !hidden.includes(tip.id))).map(tip => <div key={tip.id} className="flex items-center gap-3 rounded-lg border p-4"><p className="min-w-0 flex-1 text-sm">{tip.text}</p><Button size="sm" variant="outline" disabled={Boolean(busyTip)} onClick={() => onTry(tip.id)}>{busyTip === tip.id ? "Checking…" : "Try"}<ArrowRightIcon data-icon="inline-end" /></Button>{!hidden.includes(tip.id) && <Button size="icon-sm" variant="ghost" aria-label={`Dismiss: ${tip.text}`} onClick={() => dismiss(tip.id)}><XIcon /></Button>}</div>)}
      {!showAll && ignored && <p className="text-sm text-muted-foreground">Tips are tucked away. Explore them anytime with “View all use cases”.</p>}
      {!showAll && homeTips.every(tip => hidden.includes(tip.id)) && <p className="text-sm text-muted-foreground">You’re all set. Use “View all use cases” whenever you want to explore.</p>}
    </section>
    <Separator />
    <section className="flex flex-col gap-3"><h3 className="font-medium">Your collaboration workspace</h3><div className="flex flex-wrap gap-2">{["messages", "sessions", "files", "canvas", "skills"].map(tab => <Button key={tab} variant="outline" onClick={() => onNavigate(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</Button>)}</div><p className="text-sm text-muted-foreground">Messages and Canvas connect context and actions. Sessions and Files hold shared work; Skills share reusable capabilities.</p></section>
  </div>;
}

export function completeHomeTip(accountId: string, id: string) {
  const key = `colab:onboarding:${accountId}`;
  let hidden: string[] = [];
  try { hidden = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { /* Fresh preference. */ }
  localStorage.setItem(key, JSON.stringify([...new Set([...hidden, id])]));
}
