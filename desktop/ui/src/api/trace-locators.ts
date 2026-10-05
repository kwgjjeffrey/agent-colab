import { operations } from "./trace-operations";

/** DOM bindings consume the same registered IDs as runtime spans. Multiple operations may
 * share one stateful control (check/update/restart), without invoking it during inspection. */
export function traceTargets(...ids: string[]): string {
  return ids.map(id => {
    const operation = operations[id];
    if (!operation) throw new Error(`Unregistered trace target: ${id}`);
    return operation.entry.target;
  }).join(" ");
}
