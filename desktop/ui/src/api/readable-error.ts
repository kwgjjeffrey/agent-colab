/** Unwrap Core/Server error envelopes without displaying protocol JSON to users. */
export function readableError(reason: unknown): string {
  let value: unknown = reason instanceof Error ? reason.message : reason;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof value === 'object' && value !== null) {
      const envelope = value as {message?: unknown; error?: unknown};
      value = envelope.message ?? envelope.error ?? value;
      if (typeof value === 'object') break;
    }
    if (typeof value !== 'string') break;
    value = value.replace(/^Error:\s*/, '');
    try { value = JSON.parse(String(value)); } catch { return String(value).slice(0, 500); }
  }
  return String(value).slice(0, 500);
}
