import {describe,expect,it} from "vitest";
import {MESSAGE_STREAM_STALE_AFTER_MS,messageStreamIsStale} from "./message-stream";

describe("Messages stream liveness",()=>{
  it("recycles an open connection after the heartbeat deadline",()=>{
    expect(messageStreamIsStale(true,1_000,1_000+MESSAGE_STREAM_STALE_AFTER_MS+1)).toBe(true);
  });
  it("does not recycle a recently active or already closed connection",()=>{
    expect(messageStreamIsStale(true,1_000,1_000+MESSAGE_STREAM_STALE_AFTER_MS)).toBe(false);
    expect(messageStreamIsStale(false,1_000,1_000+MESSAGE_STREAM_STALE_AFTER_MS+1)).toBe(false);
  });
});
