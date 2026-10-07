import {parameter,core} from './client.mjs';
export async function control(ctx,resource,operation){
 if(ctx.parameters.isolationConfirmed!==true)ctx.block('Process/network control requires an explicitly isolated test client');
 const binding=parameter(ctx,resource)?.[operation];
 if(!binding?.executable||!Array.isArray(binding.args))ctx.block(`Missing ${resource}.${operation} process control`);
 const result=await ctx.command(`${resource}: ${operation}`,binding.executable,binding.args);
 ctx.assert(`${resource}.${operation} succeeds`,result.code,0);
}
export function isolated(ctx){if(ctx.parameters.isolationConfirmed!==true)ctx.block('A disposable isolated client is required');return {discoveryFile:parameter(ctx,'isolatedCoreDiscoveryFile'),baseUrl:parameter(ctx,'isolatedClientBaseUrl')};}
export async function secondary(ctx){const page=await ctx.page.context().newPage();await page.goto(parameter(ctx,'secondClientBaseUrl'));return page;}
export function messageBody(text,{replyToMessageId,mentions=[]}={}){return {plainText:mentions.map(m=>m.kind==='agent'?'@'+m.label:`[${m.label} · ${m.kind}:${m.id}]`).join(' ')+(mentions.length?' ':'')+text,content:{type:'doc',content:[{type:'paragraph',content:[...mentions.flatMap(m=>[{type:'mention',attrs:{...m,kind:m.kind||'agent',label:m.label||m.name}},{type:'text',text:' '}]),{type:'text',text}]}]},clientNonce:crypto.randomUUID(),...(replyToMessageId?{replyToMessageId}:{})};}
export async function seed(ctx,text,options={}){return core(ctx,'POST','/v1/channels/'+ctx.resources.channel.id+'/messages',messageBody(text,options));}
