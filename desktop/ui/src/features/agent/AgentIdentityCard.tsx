import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { AgentRequestStatus } from "@/features/messages/types";

export function taskTiming(request: AgentRequestStatus, now: number) {
  const started = request.startedAt ? Date.parse(request.startedAt) : NaN;
  const finished = request.finishedAt ? Date.parse(request.finishedAt) : NaN;
  const milliseconds =
    request.durationMs ??
    (Number.isFinite(started) && Number.isFinite(finished)
      ? finished - started
      : request.state === "running" && Number.isFinite(started)
        ? now - started
        : null);
  const seconds =
    milliseconds == null ? null : Math.max(0, Math.floor(milliseconds / 1000));
  const duration =
    seconds == null
      ? "Duration not recorded"
      : seconds < 60
        ? `${seconds}s`
        : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const time = Number.isFinite(started)
    ? `Started ${new Date(started).toLocaleString()}`
    : request.createdAt
      ? `Requested ${new Date(request.createdAt).toLocaleString()} · ${["queued", "delivering", "awaiting_owner"].includes(request.state) ? "Not started" : "Start time not recorded"}`
      : "Start time not recorded";
  return { time, duration };
}

export function AgentIdentityCard({
  name,
  ownerName,
  requests,
  showWork,
  children,
}: {
  name: string;
  ownerName: string;
  requests: AgentRequestStatus[];
  showWork: (request: AgentRequestStatus) => void;
  children?: ReactNode;
}) {
  const [now, setNow] = useState(Date.now);
  const running = requests.some((request) => request.state === "running");
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return (
    <>
      <div className="font-semibold">{name}</div>
      <div className="text-muted-foreground">{ownerName}'s Agent</div>
      <div
        className="mt-3 flex max-h-64 flex-col gap-1 overflow-auto"
        aria-label="Agent tasks"
      >
        <div className="text-xs text-muted-foreground">
          {requests.length} tasks · Newest first
        </div>
        {requests.map((request, index) => (
          <Button
            key={request.id}
            data-request-id={request.id}
            variant="secondary"
            size="sm"
            className="h-auto justify-start px-3 py-2"
            onClick={() => showWork(request)}
          >
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
              <span className="text-xs">
                Task {requests.length - index} ·{" "}
                {request.state.replaceAll("_", " ")}
              </span>
              <span className="max-w-full whitespace-normal text-xs text-muted-foreground">
                {taskTiming(request, now).time}
              </span>
              <span className="text-xs text-muted-foreground">
                {taskTiming(request, now).duration}
              </span>
              <span className="max-w-full truncate">
                {request.summary ??
                  (request.sourceCanvasId
                    ? "Canvas instruction"
                    : "Message instruction")}
              </span>
            </span>
          </Button>
        ))}
        {!requests.length && (
          <div className="text-sm text-muted-foreground">No tasks yet.</div>
        )}
      </div>
      {children}
    </>
  );
}
