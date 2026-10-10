export const USECASE = {
  "name": "Browse and preview shared files",
  "description": "Purpose: Human inspection needs a faithful counterpart to agent reads.\n\nPreconditions: A share contains text, a supported preview type and an unsupported file.\n\nActions: Browse its tree and select each fixture.\n\nExpected results: Supported content displays correctly; unsupported content has an honest fallback; loading failures remain visible."
};

export const META = {
  "id": "context.files.reading.preview",
  "module": "context/files/reading",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
  "desktop/ui/src/features",
  "skills/colab/bin"
],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed Run/Round 20261010T113944Z-f6d9b315: installed GUI181; Markdown headings/tables/source switch, code highlighting/line numbers, text, decoded image, unsupported format and corrupt workbook all pass; screenshots reviewed; owned share withdrawn.",
  "locks": [
    "read:client.primary",
    "read:channel.shared"
  ]
};

import fs from 'node:fs/promises';import path from 'node:path';
import {openTab} from '../../../../support/gui.mjs';
import {resource,core,disposable,eventually} from '../../../../support/client.mjs';
import {ownedFiles} from '../../../../support/fixtures.mjs';
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
export async function run(ctx){
 disposable(ctx);const source=await ownedFiles(ctx),name='Preview '+ctx.runId;const expected=await fs.readFile(path.join(source,'hello.txt'),'utf8');
 await fs.writeFile(path.join(source,'report.md'),'# Preview report\n\n| Metric | Value |\n| --- | --- |\n| Passed | 28 |');
 await fs.writeFile(path.join(source,'sample.ts'),'const answer = 42;\nconsole.log(answer);');
 await fs.writeFile(path.join(source,'preview.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==','base64'));
 await fs.writeFile(path.join(source,'unsupported.bin'),Buffer.from([0,255,0,255]));await fs.writeFile(path.join(source,'corrupt.xlsx'),'This is deliberately not an Office ZIP');
 const share=await core(ctx,'POST','/v1/channels/'+resource(ctx,'channel').id+'/files/share',{localPath:source,name,syncExcludes:[]});
 try{await eventually(ctx,'Preview fixture has a published root',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/files'),rows=>rows.some(x=>x.id===share.id&&x.currentRootOid),{timeoutMs:90000});await openTab(ctx,'Files');await ctx.page.locator(`[data-item-id="${share.id}"][data-item-kind="files"]`).click();const tree=ctx.page.getByRole('tree',{name:name+' files',exact:true}),preview=ctx.page.locator('[data-trace-region="file-preview"]');const failures=[];
 const checks=[['report.md',async()=>{await preview.getByRole('heading',{name:'Preview report'}).waitFor();ctx.assert('Markdown table rendered',await preview.getByRole('table').count(),1);await preview.getByRole('button',{name:'Source',exact:true}).click();await preview.locator('[data-code-preview]').waitFor();ctx.assert('Markdown source retained',(await preview.innerText()).includes('# Preview report'),true);await preview.getByRole('button',{name:'Preview',exact:true}).click();} ],['sample.ts',async()=>{await preview.locator('[data-code-preview] [style]').first().waitFor();ctx.assert('Source lines numbered',await preview.locator('[data-code-line]').count(),2);} ],['hello.txt',async()=>{await preview.getByText(expected,{exact:false}).waitFor();ctx.assert('Text preview preserves source content',(await preview.innerText()).includes(expected.trim()),true);} ],['preview.png',async()=>{const image=preview.getByRole('img',{name:'preview.png',exact:true});await image.waitFor();await eventually(ctx,'Image bytes are actually decoded',()=>image.evaluate(el=>({complete:el.complete,width:el.naturalWidth})),v=>v.complete&&v.width===1);} ],['unsupported.bin',async()=>{await preview.getByText('Preview is not available for .bin files.',{exact:true}).waitFor();ctx.assert('Unsupported format has an honest fallback',await preview.innerText(),'Preview is not available for .bin files.');} ],['corrupt.xlsx',async()=>{await preview.getByText('Preview failed:',{exact:false}).waitFor();ctx.assert('Malformed supported file exposes failure',(await preview.innerText()).startsWith('Preview failed:'),true);} ]];
 for(const [file,check]of checks){try{await ctx.measure('Preview '+file,async()=>{await tree.getByRole('button',{name:file,exact:true}).click();await check();});await ctx.screenshot('Preview '+file);}catch(error){failures.push(error);}}if(failures.length)throw failures[0];
 }finally{await core(ctx,'DELETE','/v1/files/'+share.id);}
}
