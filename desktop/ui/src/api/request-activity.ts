let activeRequests = 0;
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

/** Tracks user-visible Local API work without coupling feature modules to App. */
export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit) {
  activeRequests += 1;
  publish();
  try {
    return await fetch(input, init);
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
    publish();
  }
}

export function subscribeRequestActivity(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestActivitySnapshot() {
  return activeRequests;
}
