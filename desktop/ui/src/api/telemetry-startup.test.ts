// @vitest-environment jsdom
import {test,expect,vi} from 'vitest';
import type {ReadableSpan} from '@opentelemetry/sdk-trace-web';
const {captured}=vi.hoisted(()=>({captured:[] as ReadableSpan[]}));
vi.mock('@opentelemetry/exporter-trace-otlp-proto',()=>({OTLPTraceExporter:class {
  export(spans:ReadableSpan[], callback:(result:{code:number})=>void){captured.push(...spans);callback({code:0});}
  shutdown(){return Promise.resolve();}forceFlush(){return Promise.resolve();}
}}));
import {initializeTelemetry,beginOperation,flushTelemetry} from './telemetry';
test('initial GUI work has a root before the asynchronous enablement and clock probes finish',async()=>{
 let enable!:(response:Response)=>void;
 vi.stubGlobal('setInterval',()=>0);
 vi.stubGlobal('fetch',vi.fn((url:string)=>url.endsWith('/config')?new Promise<Response>(resolve=>{enable=resolve;}):Promise.resolve(new Response(JSON.stringify({receivedMs:Date.now(),sentMs:Date.now(),reference:'local'})))));
 const startup=initializeTelemetry();
 const root=beginOperation({id:'channels.list',source:{path:'desktop/ui/src/main.tsx',function:'refreshChannels'}});
 expect(root.span.spanContext().traceId).not.toBe('0'.repeat(32));root.finish('success');
 const flush=flushTelemetry();expect(captured).toHaveLength(0);
 enable(new Response(JSON.stringify({enabled:true})));await startup;await flush;
 expect(captured.find(span=>span.name==='colab.channels.list')?.attributes['colab.clock.quality']).toBe('uncalibrated');
 vi.unstubAllGlobals();
});
