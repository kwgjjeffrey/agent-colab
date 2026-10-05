export interface LocatorOptions {
  /** Explicit developer diagnostic activation; defaults to false. */
  enabled?: boolean;
  allowedOrigins?: string[];
  getOperations: () => unknown[] | {operations: unknown[]} | Promise<unknown[] | {operations: unknown[]}>;
  timeoutMs?: number;
}
/** Returns a disposer which cancels pending location and removes highlights/listeners. */
export function mountLocator(options?: LocatorOptions): () => void;
