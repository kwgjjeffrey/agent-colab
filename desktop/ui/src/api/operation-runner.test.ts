import { describe, it, expect, vi } from "vitest";
import { WebTracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from "@opentelemetry/sdk-trace-web";
import { runOperation } from "./operation-runner";
import { beginOperation, resumeOperation } from "./telemetry";
import { redactPrompt } from "./prompt-observation";
const exporter = new InMemorySpanExporter();
new WebTracerProvider({spanProcessors:[new SimpleSpanProcessor(exporter)]}).register();

describe("registered operation completion",()=>{
  it("keeps overlapping actions isolated and records a handled HTTP failure",async()=>{
    const requests: Array<{headers:Headers,resolve:(r:Response)=>void}>=[];
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
    vi.stubGlobal("fetch",vi.fn((_input,init)=>new Promise<Response>(resolve=>requests.push({headers:new Headers(init.headers),resolve}))));
    const a=runOperation("channels.create",async scope=>{try{await scope.response("/first");}catch{scope.fail();}});
    const b=runOperation("members.add",async scope=>{await scope.json("/second");});
    requests[1].resolve(new Response('{"ok":true}'));await b;
    requests[0].resolve(new Response("failed",{status:503}));await a;
    expect(requests[0].headers.get("baggage")).toBe("trace.entry.id=channels.create");
    expect(requests[1].headers.get("baggage")).toBe("trace.entry.id=members.add");
    expect(requests[0].headers.get("traceparent")?.split('-')[1]).not.toBe(requests[1].headers.get("traceparent")?.split('-')[1]);
    const failed=exporter.getFinishedSpans().find(s=>s.name==='colab.channels.create');
    expect(failed?.attributes['colab.outcome']).toBe('error');
    vi.unstubAllGlobals();
  });
  it("threads compound refreshes and delayed GUI results onto their initiating trace",async()=>{
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
    let traceId="", parentId="";
    await runOperation("channels.create",async scope=>{
      traceId=scope.operation.span.spanContext().traceId;parentId=scope.operation.span.spanContext().spanId;
      await runOperation("channels.list",async child=>{
        expect(child.operation.entryId).toBe("channels.create");
        expect(child.operation.span.spanContext().traceId).toBe(traceId);
      },{parent:scope.operation});
    });
    const result=resumeOperation("agent.result.presented",{version:1,traceparent:`00-${traceId}-${parentId}-01`,entryId:"channels.create"},{path:"test.ts",function:"result"})!;
    expect(result.span.spanContext().traceId).toBe(traceId);
    result.finish("success");
    expect(exporter.getFinishedSpans().find(s=>s.name==="colab.agent.result.presented")?.parentSpanContext?.spanId).toBe(parentId);
    expect(resumeOperation("ignored",{version:1,traceparent:"bad"},{path:"test.ts",function:"result"})).toBeUndefined();
    vi.stubGlobal("location",{origin:"http://127.0.0.1:9999"});
    const native=beginOperation("files.preview.native");
    expect(native.nativeUrl("/v1/files/test/raw?path=image.png")).toContain("__traceparent=00-");native.finish("cancelled");
    vi.unstubAllGlobals();
  });
  it("captures the exact handoff while redacting capability credentials",async()=>{
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
    const prompt="Read the user's context.\ncolab-transfer receive --capability 'private-test-capability'\nKeep this task text.";
    await runOperation('transfers.prompt.copy',async scope=>{scope.prompt(prompt,'transfer.handoff','codex');});
    const captured=exporter.getFinishedSpans().filter(s=>s.name==='colab.prompt.assemble').at(-1)!;
    expect(captured.attributes['prompt.content']).toBe(redactPrompt(prompt));
    expect(captured.attributes['prompt.redacted']).toBe(true);
    expect(captured.attributes['prompt.content']).not.toContain('private-test-capability');
    expect(captured.attributes['trace.entry.id']).toBe('transfers.prompt.copy');
    vi.unstubAllGlobals();
  });
});
