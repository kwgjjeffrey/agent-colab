import { messageRequest as baseMessageRequest } from "@/features/messages/api";
import { trackedFetch } from "./request-activity";
import { beginOperation, telemetryFetch, Operation } from "./telemetry";
import { observePrompt } from "./prompt-observation";
import { operations } from "./trace-operations";

/** Explicit closures keep concurrent actions isolated; never hold a global current operation. */
export class OperationScope {
  private failed = false;
  private cancelled = false;
  constructor(readonly operation: Operation) {}
  prompt(content: string, kind: string, target: string) { observePrompt(content, kind, target, this.operation); }
  fail() { this.failed = true; }
  cancel() { this.cancelled = true; }
  fetch = async (input: RequestInfo | URL, init?: RequestInit, background = false) => {
    const response = await (background ? telemetryFetch(input, init, this.operation) : trackedFetch(input, init, this.operation));
    if (!response.ok) this.fail();
    return response;
  };
  response = async (path: string, init?: RequestInit, _background = false) => {
    const response = await this.fetch(path, init, _background);
    if (!response.ok) throw new Error(await response.text());
    return response;
  };
  json = async <T = undefined>(path: string, init?: RequestInit, _background = false): Promise<T> => {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await this.response(path, { ...init, headers }, _background);
    const text = response.status === 204 ? "" : await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };
  message = async <T = undefined>(path: string, init?: RequestInit, background = false): Promise<T> => {
    try { return await baseMessageRequest<T>(path, init, background, this.operation); }
    catch(error) {this.fail(); throw error;}
  };
  finish() {
    this.operation.finish(this.failed ? "error" : this.cancelled ? "cancelled" : "success", this.failed ? "result.failed" : this.cancelled ? "result.cancelled" : "result.state_committed");
  }
}
export async function runOperation<T>(id: string, action: (scope: OperationScope) => Promise<T>, options?: { parent?: Operation; started?: Operation }): Promise<T> {
  const definition = operations[id];
  if (!definition) throw new Error(`Unregistered trace entry: ${id}`);
  const scope = new OperationScope(options?.started ?? (options?.parent ? new Operation(definition, options.parent.context, undefined, options.parent.entryId) : beginOperation(definition)));
  try { return await action(scope); }
  catch (error) { scope.fail(); throw error; }
  finally {
    // Bound the presentation wait in hidden tabs. The phase means state committed, never remote sync.
    await new Promise<void>(resolve => { const timer = setTimeout(resolve, 100); if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { clearTimeout(timer); resolve(); }); });
    scope.finish();
  }
}
