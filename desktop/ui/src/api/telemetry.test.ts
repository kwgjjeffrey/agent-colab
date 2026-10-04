import { describe, it, expect, vi } from "vitest";
import { WebTracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from "@opentelemetry/sdk-trace-web";
import { beginOperation, estimateClock, telemetryFetch } from "./telemetry";

const exporter = new InMemorySpanExporter();
const provider = new WebTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
provider.register();

describe("operation boundary tracing", () => {
  it("preserves each operation's parent under overlapping requests", async () => {
    const a=beginOperation("messages.send"), b=beginOperation("channels.create");
    const headers:string[]=[];
    const complete:Array<(r:Response)=>void>=[];
    vi.stubGlobal("fetch",vi.fn((_input,_init)=>{
      headers.push(new Headers(_init.headers).get("traceparent")!);
      return new Promise<Response>(resolve=>complete.push(resolve));
    }));
    const first=telemetryFetch("/v1/messages",undefined,a);
    const second=telemetryFetch("/v1/channels",undefined,b);
    complete[1](new Response("{}"));await second;
    complete[0](new Response("{}"));await first;
    a.finish("success");b.finish("success");
    expect(headers[0].split("-")[1]).toBe(a.span.spanContext().traceId);
    expect(headers[1].split("-")[1]).toBe(b.span.spanContext().traceId);
    expect(headers[0].split("-")[1]).not.toBe(headers[1].split("-")[1]);
    const spans=exporter.getFinishedSpans();
    const children=spans.filter(s=>s.name==="colab.http.request");
    expect(children.at(-2)?.parentSpanContext?.spanId).toBe(b.span.spanContext().spanId);
    expect(children.at(-1)?.parentSpanContext?.spanId).toBe(a.span.spanContext().spanId);
    vi.unstubAllGlobals();
  });
  it("does not turn a wall-clock jump into a huge or negative operation duration",()=>{
    const operation=beginOperation("files.preview");
    const wall=vi.spyOn(Date,"now").mockReturnValue(1);
    operation.finish("success");operation.finish("error");
    wall.mockRestore();
    const spans=exporter.getFinishedSpans().filter(s=>s.name==="colab.files.preview");
    expect(spans).toHaveLength(1);
    const duration=spans[0].attributes["colab.duration_ms"] as number;
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(duration).toBeLessThan(1000);
    expect(spans[0].attributes["colab.outcome"]).toBe("success");
  });
  it("keeps asymmetric-network uncertainty and rejects invalid samples",()=>{
    const sample=estimateClock(1000,6020,6030,1110)!;
    expect(sample.offsetMs-sample.uncertaintyMs).toBeLessThanOrEqual(5000);
    expect(sample.offsetMs+sample.uncertaintyMs).toBeGreaterThanOrEqual(5000);
    expect(estimateClock(10,20,50,15)).toBeUndefined();
    expect(estimateClock(NaN,0,0,0)).toBeUndefined();
  });
});
