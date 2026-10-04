import { telemetryFetch, type Operation } from "@/api/telemetry";
import { trackedFetch } from "@/api/request-activity";

/** HTTP 204 is a successful mutation, not malformed JSON. */
export async function messageRequest<T = undefined>(path: string, init?: RequestInit, background = false, operation?: Operation): Promise<T> {
  const response = await (background ? telemetryFetch(path, init, operation) : trackedFetch(path, init, operation));
  const text = response.status === 204 ? "" : await response.text();
  if (!response.ok) throw new Error(text || `${response.status} ${response.statusText}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
