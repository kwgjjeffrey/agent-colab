import { Operation } from "./telemetry";

/** Prompt auditing is explicitly requested for this project; capability secrets remain private. */
export function redactPrompt(content: string) {
  return content
    .replace(/(--(?:capability|token|secret|password)\s+)(?:'[^']*'|"[^"]*"|\S+)/gi, "$1'[REDACTED]'")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|secret|capability)=)[^\s&'"<>]+/gi, "$1[REDACTED]");
}
export function observePrompt(content: string, kind: string, target: string, parent?: Operation) {
  try {
    const safe = redactPrompt(content), bytes = new TextEncoder().encode(safe), limit = 128 * 1024;
    const observed = bytes.length <= limit ? safe : new TextDecoder().decode(bytes.slice(0, limit), { stream: true });
    const span = new Operation({ id: "prompt.assemble", source: { path: "desktop/ui/src/api/prompt-observation.ts", function: "observePrompt" } }, parent?.context, undefined, parent?.entryId);
    span.span.setAttributes({ "prompt.kind": kind, "prompt.stage": "handoff", "prompt.target": target, "prompt.template.version": "1", "prompt.content": observed, "prompt.bytes": new TextEncoder().encode(content).length, "prompt.redacted": safe !== content, "prompt.truncated": bytes.length > limit });
    span.finish("success", "prompt.assembled");
  } catch { /* Observation never changes the actual prompt or prevents an Agent handoff. */ }
}
