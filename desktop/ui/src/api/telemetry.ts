import { registry } from "./trace-operations";
import { context, trace, SpanKind, SpanStatusCode, type Span, type Context } from "@opentelemetry/api";
import { WebTracerProvider, BatchSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-web";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import metadata from "../../package.json";

let provider: WebTracerProvider | undefined;
let clockQuality = "uncalibrated";
let offsetMs = 0, uncertaintyMs: number | undefined, calibratedAt = 0;
const epochOrigin = Date.now() - performance.now();
const rawNow = () => epochOrigin + performance.now();
export function estimateClock(t1: number, t2: number, t3: number, t4: number) {
  if (![t1,t2,t3,t4].every(Number.isFinite) || t4 < t1 || t3 < t2) return;
  const rtt = t4-t1-(t3-t2);
  if (rtt < -0.1) return;
  return { offsetMs: ((t2-t1)+(t3-t4))/2, uncertaintyMs: Math.max(0,rtt)/2 };
}
async function calibrate() {
  let best: (NonNullable<ReturnType<typeof estimateClock>> & { quality: string }) | undefined;
  for (let i=0;i<3;i++) {
    const t1 = rawNow();
    try {
      const r = await fetch("/v1/observability/clock", { signal: AbortSignal.timeout(2000) });
      if (!r.ok) continue;
      const c = await r.json(); const t4=rawNow();
      const sample=estimateClock(t1,c.receivedMs,c.sentMs,t4);
      if (sample && (!best || sample.uncertaintyMs<best.uncertaintyMs)) {
        best = { ...sample, quality: c.reference === "local" ? "local_only" : "estimated", uncertaintyMs: sample.uncertaintyMs+(c.calibration?.uncertaintyMs ?? 0) };
      }
    } catch { /* Telemetry must not affect navigation or operation outcomes. */ }
  }
  if (best) { offsetMs=best.offsetMs; clockQuality=best.quality; uncertaintyMs=best.uncertaintyMs; calibratedAt=performance.now(); }
}
export async function initializeTelemetry() {
  if (provider) return;
  let release: ((enabled:boolean)=>void) | undefined;
  try {
    const ready=new Promise<boolean>(resolve=>{release=resolve;});
    const exporter=new OTLPTraceExporter({url:`${location.origin}/v1/observability/traces`,timeoutMillis:3000});
    // Register synchronously so initial React loads have roots. Collection never waits for a
    // clock/network probe; the exporter waits for the bounded enablement check and drops if off.
    const gated:SpanExporter={
      export:(spans,callback)=>{void ready.then(enabled=>{if(enabled)exporter.export(spans,callback);else callback({code:0});});},
      shutdown:()=>exporter.shutdown(), forceFlush:()=>exporter.forceFlush(),
    };
    provider=new WebTracerProvider({resource:resourceFromAttributes({"service.name":"colab-desktop-ui","service.version":metadata.version}),spanProcessors:[new BatchSpanProcessor(gated,{maxQueueSize:512,maxExportBatchSize:4,scheduledDelayMillis:1000})]});
    provider.register();
    const r=await fetch("/v1/observability/config",{signal:AbortSignal.timeout(2000)});
    if (!r.ok || !(await r.json()).enabled) {release?.(false);return;}
    await calibrate(); release?.(true);
    setInterval(()=>{if(performance.now()-calibratedAt>=240000)void calibrate();},60000);
    window.addEventListener("online",()=>void calibrate());
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void calibrate();});
  } catch { release?.(false); /* Optional instrumentation cannot prevent app startup. */ }
}

export async function flushTelemetry() {await provider?.forceFlush();}
export class Operation {
  readonly span: Span; readonly context: Context;
  private readonly started=performance.now();
  private readonly startTime=rawNow()+offsetMs;
  private ended=false;
  readonly name: string;
  readonly entryId: string;
  constructor(definition:string | {id:string;source:{path:string;function:string}}, parent?:Context, kind=SpanKind.INTERNAL, entryId?:string) {
    this.name=typeof definition === "string"?definition:definition.id;
    const name=this.name; this.entryId=entryId ?? name;
    this.span=trace.getTracer("agent-colab.operation").startSpan(`colab.${name}`,{kind,startTime:this.startTime,attributes:{"colab.operation":name,"colab.origin":"gui","colab.clock.quality":uncertaintyMs===undefined || performance.now()-calibratedAt>300000?"uncalibrated":clockQuality,"colab.clock.offset_ms":offsetMs,...(uncertaintyMs!==undefined?{"colab.clock.uncertainty_ms":uncertaintyMs}:{})}},parent ?? context.active());
    this.span.setAttributes({"trace.entry.id":this.entryId,"trace.registry.unit":registry.unit,"code.revision":import.meta.env.VITE_COLAB_CODE_REVISION ?? "unknown",...(typeof definition === "string"?{}:{"code.file.path":definition.source.path,"code.function.name":definition.source.function})});
    this.context=trace.setSpan(parent ?? context.active(),this.span);
  }
  nativeUrl(input: string) {
    const url = new URL(input, location.origin);
    if (url.origin !== location.origin) throw new Error("Native trace URLs must stay on Local Core");
    const parent = this.headers().get("traceparent");
    if (parent) url.searchParams.set("__traceparent", parent);
    url.searchParams.set("__trace_entry", this.entryId);
    return url.pathname + url.search;
  }
  headers(init?:HeadersInit) {
    const headers=new Headers(init); const c=this.span.spanContext();
    if(c.traceId!=="00000000000000000000000000000000")headers.set("traceparent",`00-${c.traceId}-${c.spanId}-${c.traceFlags.toString(16).padStart(2,"0")}`);
    headers.set("baggage",`trace.entry.id=${encodeURIComponent(this.entryId)}`);
    return headers;
  }
  finish(outcome:"success"|"error"|"cancelled",phase="result.presented") {
    if(this.ended)return; this.ended=true;
    const duration=performance.now()-this.started;
    this.span.setAttributes({"colab.outcome":outcome,"colab.phase":phase,"colab.duration_ms":duration});
    if(outcome==="error")this.span.setStatus({code:SpanStatusCode.ERROR});
    this.span.end(this.startTime+duration);
  }
}
export function resumeOperation(name:string, envelope:{version:number;traceparent?:string;entryId?:string}, source:{path:string;function:string}) {
  const match=envelope.version===1 && envelope.traceparent?.match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i);
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return;
  const parent=trace.setSpanContext(context.active(),{traceId:match[1],spanId:match[2],traceFlags:parseInt(match[3],16),isRemote:true});
  return new Operation({id:name,source},parent,SpanKind.INTERNAL,envelope.entryId);
}
export function beginOperation(name:string | {id:string;source:{path:string;function:string}}) {return new Operation(name);}
/** Transport spans are fallback coverage, not a claim that a user action has completed. */
export async function telemetryFetch(input:RequestInfo|URL,init?:RequestInit,operation?:Operation) {
  const span=new Operation({id:"http.request",source:{path:"desktop/ui/src/api/telemetry.ts",function:"telemetryFetch"}},operation?.context,SpanKind.CLIENT,operation?.entryId);
  span.span.setAttribute("colab.coverage",operation?"operation":"transport_only");
  try {
    const response=await fetch(input,{...init,headers:span.headers(init?.headers ?? (input instanceof Request?input.headers:undefined))});
    span.span.setAttribute("http.response.status_code",response.status);
    span.finish(response.ok?"success":"error","response.headers_received");
    return response;
  } catch(error) {span.finish("error","transport.failed");throw error;}
}
