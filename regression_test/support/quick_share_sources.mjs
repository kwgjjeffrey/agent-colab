import fs from 'node:fs/promises';import path from 'node:path';
import {core,resource,parameter,eventually,disposable} from './client.mjs';
import {ownedFiles} from './fixtures.mjs';
// Catalog discovery is scoped to the bound test Agent's actual provider thread.
// Never edit that transcript: a real new instruction supplies the later source change.
export async function quickShareSources(ctx){
 disposable(ctx);const channel=resource(ctx,'channel'),agent=resource(ctx,'agent');
 const requests=await core(ctx,'GET','/v1/channels/'+channel.id+'/agent-requests');
 const request=requests.find(r=>r.targetBlueprintId===agent.id&&r.state==='succeeded');
 if(!request)ctx.block('A completed real test Agent request is needed for Session source selection');
 const work=await eventually(ctx,'Owned Session thread is identifiable',()=>core(ctx,'GET','/v1/agent-requests/'+request.id+'/events',undefined,{capture:false}),v=>v.events.some(e=>e.params?.threadId));
 const thread=work.events.find(e=>e.params?.threadId).params.threadId;
 const sessions=await core(ctx,'GET','/v1/session-sources?q='+encodeURIComponent(thread)+'&limit=10',undefined,{capture:false});
 const matches=sessions.filter(s=>s.threadId===thread||s.sourcePath?.endsWith(thread+'.jsonl'));
 ctx.assert('Session catalog uniquely resolves the provider thread',matches.length,1);const session=matches[0];
 if(!session)ctx.block('The real test Agent Session is not yet indexed by Local Core');
 const id=parameter(ctx,'skillRef').split('/').pop(),target=parameter(ctx,'skillTarget');
 const receipt=await core(ctx,'POST','/v1/skills/'+id+'/targets/'+target+'/ensure');
 if(!path.basename(receipt.installedPath).startsWith('regression-owned'))ctx.block('Quick Share mutation requires the owned regression Skill');
 const skills=await core(ctx,'GET','/v1/skill-sources?q='+encodeURIComponent(path.basename(receipt.installedPath))+'&limit=100',undefined,{capture:false});
 let skill;for(const source of skills){try{if(await fs.realpath(source.sourcePath)===await fs.realpath(receipt.installedPath))skill=source;}catch{}}
 if(!skill)ctx.block('The owned installed Skill is not yet indexed by Local Core');
 return [{kind:'files',sourcePath:await ownedFiles(ctx)},{kind:'session',...session},{kind:'skill',...skill}];
}
