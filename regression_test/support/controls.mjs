import fs from 'node:fs/promises';
import {parameter,core} from './client.mjs';
export async function control(ctx,resource,operation){
 if(ctx.parameters.isolationConfirmed!==true)ctx.block('Process/network control requires an explicitly isolated test client');
 const binding=parameter(ctx,resource)?.[operation];
 if(!binding?.executable||!Array.isArray(binding.args))ctx.block(`Missing ${resource}.${operation} process control`);
 const result=await ctx.command(`${resource}: ${operation}`,binding.executable,[...binding.args,ctx.caseId]);
 ctx.assert(`${resource}.${operation} succeeds`,result.code,0);
}
export async function isolated(ctx){if(ctx.parameters.isolationConfirmed!==true)ctx.block('A disposable isolated client is required');const discoveryFile=parameter(ctx,'isolatedCoreDiscoveryFile');await prepareActor(ctx,discoveryFile);if(ctx.page)await authorizePage(ctx.page,discoveryFile);return {discoveryFile,baseUrl:parameter(ctx,'isolatedClientBaseUrl')};}
export async function secondary(ctx){await prepareActor(ctx,parameter(ctx,'secondCoreDiscoveryFile'));const context=await ctx.page.context().browser().newContext();const page=await context.newPage();await authorizePage(page,parameter(ctx,'secondCoreDiscoveryFile'));page.on('close',()=>{void context.close();});await page.goto(parameter(ctx,'secondClientBaseUrl'));return page;}
async function authorizePage(page,file){const d=JSON.parse(await fs.readFile(file,'utf8'));await page.context().addCookies([{name:'colab_local_token',value:d.bearer,url:d.endpoint,httpOnly:true,sameSite:'Strict'}]);}
export function messageBody(text,{replyToMessageId,mentions=[]}={}){return {plainText:mentions.map(m=>(m.kind||'agent')==='agent'?'@'+(m.label||m.name):`[${m.label} · ${m.kind}:${m.id}]`).join(' ')+(mentions.length?' ':'')+text,content:{type:'doc',content:[{type:'paragraph',content:[...mentions.flatMap(m=>[{type:'mention',attrs:{...m,kind:m.kind||'agent',label:m.label||m.name}},{type:'text',text:' '}]),{type:'text',text}]}]},clientNonce:crypto.randomUUID(),...(replyToMessageId?{replyToMessageId}:{})};}
export async function seed(ctx,text,options={}){return core(ctx,'POST','/v1/channels/'+ctx.resources.channel.id+'/messages',messageBody(text,options));}
// Policy fixtures require a distinct authenticated member, never a cloned owner client.
export async function withOtherMember(ctx,work){const email=parameter(ctx,'secondMemberEmail'),cid=ctx.resources.channel.id;await core(ctx,'POST','/v1/channels/'+cid+'/members',{email,role:'member'});try{return await work({discoveryFile:parameter(ctx,'secondMemberCoreDiscoveryFile')});}finally{const rows=await core(ctx,'GET','/v1/channels/'+cid+'/members');const member=rows.find(x=>x.email===email);if(member)await core(ctx,'DELETE','/v1/channels/'+cid+'/members/'+(member.memberId??member.userId));}}

// Bind GUI actor/tenant to explicit project fixtures before navigating. A prior test's
// temporary Organization must never silently change which resources the next case sees.
async function prepareActor(ctx,discoveryFile){const target={discoveryFile},userId=parameter(ctx,'testUserId'),organizationId=parameter(ctx,'testOrganizationId');const auth=await core(ctx,'GET','/v1/auth/status',undefined,target);if(auth.user?.id!==userId)await core(ctx,'POST','/v1/auth/device/login',{userId},target);const organizations=await core(ctx,'GET','/v1/organizations',undefined,target);if(!organizations.some(x=>x.id===organizationId&&x.active))await core(ctx,'POST','/v1/organizations/'+organizationId+'/activate',undefined,target);}
