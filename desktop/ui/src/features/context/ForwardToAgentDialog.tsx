import { AgentButton } from "@/features/agent/AgentButton";
import { traceTargets } from "@/api/trace-locators";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { Blueprint } from "@/features/messages/types";

export function ForwardToAgentDialog({
  open,
  agents,
  contextLabel,
  onClose,
  onSend,
  initialInstruction = "",
}: {
  open: boolean;
  agents: Blueprint[];
  contextLabel: string;
  onClose: () => void;
  onSend: (agent: Blueprint, instruction: string) => Promise<void>;
  initialInstruction?: string;
}) {
  const [target, setTarget] = useState<string>(),
    [instruction, setInstruction] = useState(initialInstruction),
    [sending, setSending] = useState(false),
    [error, setError] = useState<string>();
  const chosen = agents.find((agent) => agent.id === target);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !sending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forward to Agent</DialogTitle>
          <DialogDescription>
            {contextLabel}. Add your instruction before sending; the Agent may
            start working immediately.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Collaborator’s Agent</FieldLabel>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {agents.map((agent) => (
                <Button
                  key={agent.id}
                  variant={target === agent.id ? "secondary" : "outline"}
                  className="w-full justify-between"
                  onClick={() => setTarget(agent.id)}
                  aria-pressed={target === agent.id}
                >
                  <span className="truncate">{agent.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {agent.ownerName}
                  </span>
                </Button>
              ))}
              {!agents.length && (
                <p className="text-sm text-muted-foreground">
                  No Agent is available in this Channel.
                </p>
              )}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="forward-instruction">
              Your instruction
            </FieldLabel>
            <Textarea
              id="forward-instruction"
              placeholder="What should the Agent do with this context?"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
          </Field>
        </FieldGroup>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={sending} onClick={onClose}>
            Cancel
          </Button>
          <AgentButton data-trace-target={traceTargets("context.forward")}
            disabled={!chosen || sending}
            onClick={async () => {
              if (!chosen) return;
              setSending(true);
              setError(undefined);
              try {
                await onSend(chosen, instruction.trim());
                onClose();
              } catch (reason) {
                setError(String(reason));
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? "Sending…" : "Send to Agent"}
          </AgentButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
