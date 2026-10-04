export const MESSAGE_STREAM_STALE_AFTER_MS = 45_000;

/** A half-open WebSocket does not emit `close`; the caller must recycle it after missed heartbeats. */
export function messageStreamIsStale(isOpen:boolean,lastFrameAt:number,now:number=Date.now()){
  return isOpen&&now-lastFrameAt>MESSAGE_STREAM_STALE_AFTER_MS;
}
