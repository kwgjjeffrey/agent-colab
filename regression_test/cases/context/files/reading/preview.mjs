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
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source bf7c1e294ad4: Actual GUI decodes image pixels, preserves text, exposes unsupported/malformed fallbacks; independent share cleaned.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "read:browser.navigation"
  ]
};

import fs from 'node:fs/promises';import path from 'node:path';
import {openTab} from '../../../../support/gui.mjs';
import {resource,core,disposable,eventually} from '../../../../support/client.mjs';
import {ownedFiles} from '../../../../support/fixtures.mjs';
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
export async function run(ctx){
 disposable(ctx);const source=await ownedFiles(ctx),name='Preview '+ctx.runId;const expected=await fs.readFile(path.join(source,'hello.txt'),'utf8');
 await fs.writeFile(path.join(source,'preview.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==','base64'));
 await fs.writeFile(path.join(source,'unsupported.bin'),Buffer.from([0,255,0,255]));await fs.writeFile(path.join(source,'corrupt.xlsx'),'This is deliberately not an Office ZIP');
 const share=await core(ctx,'POST','/v1/channels/'+resource(ctx,'channel').id+'/files/share',{localPath:source,name,syncExcludes:[]});
 try{await eventually(ctx,'Preview fixture has a published root',()=>core(ctx,'GET','/v1/channels/'+resource(ctx,'channel').id+'/files'),rows=>rows.some(x=>x.id===share.id&&x.currentRootOid),{timeoutMs:90000});await openTab(ctx,'Files');const row=ctx.page.locator('div.group').filter({hasText:name});await row.locator('[data-trace-target~="files.browse"]').click();const tree=ctx.page.getByRole('tree',{name:name+' files',exact:true}),preview=ctx.page.locator('[data-trace-region="file-preview"]');const failures=[];
 const checks=[['hello.txt',async()=>{await preview.getByText(expected,{exact:false}).waitFor();ctx.assert('Text preview preserves source content',await preview.innerText(),expected);} ],['preview.png',async()=>{const image=preview.getByRole('img',{name:'preview.png',exact:true});await image.waitFor();await eventually(ctx,'Image bytes are actually decoded',()=>image.evaluate(el=>({complete:el.complete,width:el.naturalWidth})),v=>v.complete&&v.width===1);} ],['unsupported.bin',async()=>{await preview.getByText('Preview is not available for .bin files.',{exact:true}).waitFor();ctx.assert('Unsupported format has an honest fallback',await preview.innerText(),'Preview is not available for .bin files.');} ],['corrupt.xlsx',async()=>{await preview.getByText('Preview failed:',{exact:false}).waitFor();ctx.assert('Malformed supported file exposes failure',(await preview.innerText()).startsWith('Preview failed:'),true);} ]];
 for(const [file,check]of checks){try{await ctx.measure('Preview '+file,async()=>{await tree.getByRole('button',{name:file,exact:true}).click();await check();});await ctx.screenshot('Preview '+file);}catch(error){failures.push(error);}}if(failures.length)throw failures[0];
 }finally{await core(ctx,'DELETE','/v1/files/'+share.id);}
}
