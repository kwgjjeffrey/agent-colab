import { messageStreamIsStale } from "@/features/messages/message-stream";

export type RealtimeFrame={type:string;channelId?:string;canvasId?:string;latestSeq?:number;runtimeId?:string};
type Listener=(frame:RealtimeFrame)=>void;

class AccountRealtime {
  private listeners=new Set<Listener>();
  private socket?:WebSocket;
  private retry?:ReturnType<typeof setTimeout>;
  private watchdog?:ReturnType<typeof setInterval>;
  private attempts=0;
  private lastFrameAt=0;
  subscribe(listener:Listener){this.listeners.add(listener);if(this.listeners.size===1)this.start();return()=>{this.listeners.delete(listener);if(!this.listeners.size)this.stop()}}
  private publish(frame:RealtimeFrame){for(const listener of this.listeners)listener(frame)}
  private start(){this.connect();this.watchdog=setInterval(()=>{if(messageStreamIsStale(this.socket?.readyState===WebSocket.OPEN,this.lastFrameAt))this.socket?.close()},5000)}
  private connect(){this.lastFrameAt=Date.now();this.socket=new WebSocket(`${location.protocol==="https:"?"wss":"ws"}://${location.host}/v1/messages/stream`);this.socket.onopen=()=>{this.attempts=0;this.lastFrameAt=Date.now();this.publish({type:"realtime.connected"})};this.socket.onmessage=event=>{this.lastFrameAt=Date.now();try{this.publish(JSON.parse(String(event.data)) as RealtimeFrame)}catch{/* durable cursor repair runs on the next valid frame */}};this.socket.onerror=()=>this.socket?.close();this.socket.onclose=()=>{if(this.listeners.size)this.retry=setTimeout(()=>this.connect(),Math.min(1000*2**Math.min(++this.attempts,5),30000))}}
  private stop(){if(this.retry)clearTimeout(this.retry);if(this.watchdog)clearInterval(this.watchdog);this.retry=undefined;this.watchdog=undefined;this.socket?.close();this.socket=undefined}
}

export const accountRealtime=new AccountRealtime();
