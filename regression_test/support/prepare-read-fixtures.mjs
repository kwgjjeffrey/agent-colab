// Project-owned fixture preparation. Credentials remain in the real Core's private discovery.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {execFile} from 'node:child_process';import {pathToFileURL} from 'node:url';
const repo=path.resolve(import.meta.dirname,'../..'),skill=process.env.TRACE_INSTALL_DIR||path.join(os.homedir(),'.codex/skills/trace'),require=createRequire(path.join(skill,'package.json')),YAML=require('yaml');
const profile=path.join(repo,'regression_test/environment/environment.local.yaml'),env=YAML.parse(await fs.readFile(profile,'utf8')),p=env.parameters,config=YAML.parse(await fs.readFile(path.join(repo,'regression_test/regression.config.yaml'),'utf8'));const repaired=[];
async function core(method,route,body=null){return new Promise((resolve,reject)=>{const child=execFile('python3',['regression_test/support/core.py',method,route,'-'],{cwd:repo},(error,out)=>{try{const v=JSON.parse(out);if(!v.ok)throw Error(v.error);resolve(v.data);}catch(e){reject(e);}});child.stdin.end(JSON.stringify(body));});}
if(p.disposable!==true)throw Error('Bind a disposable regression environment before preparing fixtures');
const channel=(await core('GET','/v1/channels')).find(c=>c.id===p.channel);if(!channel)throw Error('Bound Channel unavailable; configure its ID first');
const messageBody=text=>({plainText:text,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]},clientNonce:crypto.randomUUID()});
let first=p.messageReadId?await core('GET','/v1/channels/'+p.channel+'/messages?after='+Math.max(0,(p.messageReadSeq||1)-1)+'&limit=10').then(rows=>rows.find(x=>x.id===p.messageReadId)):null;
if(!first){first=await core('POST','/v1/channels/'+p.channel+'/messages',messageBody('REGRESSION_READ_FIXTURE_'+crypto.randomUUID()));p.messageReadId=first.id;p.messageReadSeq=first.seq;p.messageReadExpectedBody=first.body;repaired.push('message.first');}
let later=p.messageReadLaterId?await core('GET','/v1/channels/'+p.channel+'/messages?after='+first.seq+'&limit=100').then(rows=>rows.find(x=>x.id===p.messageReadLaterId)):null;
if(!later){later=await core('POST','/v1/channels/'+p.channel+'/messages',messageBody('REGRESSION_READ_LATER_'+crypto.randomUUID()));p.messageReadLaterId=later.id;p.messageReadLaterBody=later.body;repaired.push('message.later');}
for(const[kind,key,sourceKey]of [['files','filesRef','continuousSourceFile'],['sessions','sessionRef','sessionSourcePath'],['skills','skillRef','skillSourceFile']]){
 const rows=await core('GET','/v1/channels/'+p.channel+'/'+kind),id=p[key]?.split('/').pop();let row=rows.find(x=>x.id===id);
 if(!row){const source=p[sourceKey];if(!source)throw Error('Configure '+sourceKey+' to repair '+key);await fs.access(source);const name='Regression Read '+kind;const body=kind==='files'?{localPath:path.dirname(source),name}:kind==='sessions'?{sourcePath:source,sourceAdapter:'codex-jsonl-v1',name}:{sourcePath:path.dirname(source),name};row=await core('POST','/v1/channels/'+p.channel+'/'+kind+'/share',body);p[key]='colab://channel/'+p.channel+'/'+row.id;p[{files:'filesName',sessions:'sessionName',skills:'skillName'}[kind]]=row.name;repaired.push(key);}
}
let doc=(await core('GET','/v1/channels/'+p.channel+'/canvases')).find(x=>x.id===p.canvasRef?.split('/').pop());
if(!doc){doc=await core('POST','/v1/channels/'+p.channel+'/canvases',{title:'Regression Shared Read Canvas'});p.canvasRef='colab://channel/'+p.channel+'/canvas/'+doc.id;repaired.push('canvasRef');}
await fs.writeFile(profile,YAML.stringify(env),{mode:0o600});
const projection=await core('GET','/v1/canvases/'+doc.id+'/document');
if(!projection.content.includes('CANVAS_SEARCH_FIXTURE')||projection.content.split('\n').length<30){
 const lines=['CANVAS_ORIGINAL','CANVAS_SEARCH_FIXTURE',...Array.from({length:38},(_,i)=>'READ_LINE_'+(i+3))],before=projection.content.trimEnd().split('\n');
 const patch='*** Begin Patch\n*** Update File: document.md\n@@\n'+before.map(x=>'-'+x).join('\n')+'\n'+lines.map(x=>'+'+x).join('\n')+'\n*** End Patch\n';
 await new Promise((resolve,reject)=>{const child=execFile('python3',['skills/colab/bin/colab-canvas','apply-patch','--ref',p.canvasRef],{cwd:repo,timeout:60000},(error,out)=>error?reject(Error('Fixture projection patch failed')):resolve());child.stdin.end(patch);});
 const after=await core('GET','/v1/canvases/'+doc.id+'/document');if(!after.content.includes('READ_LINE_40'))throw Error('Patched read fixture did not persist');repaired.push('canvas.longProjection');
}
p.canvasOldText='CANVAS_ORIGINAL';p.canvasExpectedText='CANVAS_SEARCH_FIXTURE';p.canvasSearchTerm='CANVAS_SEARCH_FIXTURE';
await fs.writeFile(profile,YAML.stringify(env),{mode:0o600});console.log(JSON.stringify({ready:true,repaired,channelId:p.channel,bindings:['messageReadId','messageReadLaterId','filesRef','sessionRef','skillRef','canvasRef']}));
