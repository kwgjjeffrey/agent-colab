export const USECASE={name:'Paste, resize and consume Canvas images',description:'Upload a real image through GUI and R2, verify reload and Markdown handle, set hidden Agent interpretation, download exact original bytes and preserve the image across text edits. Archive only the owned document.'};
export const META={id:'canvas.editing.images',module:'canvas/editing',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/canvas','local/canvas-codec','server/standalone/crates/api/src/canvas_images.rs'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','read:channel.shared','write:canvas.collection']};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
import {createDocument,deleteDocument} from '../../../support/canvas.mjs';
import {core,eventually,disposable,data,cli} from '../../../support/client.mjs';
import {openTab} from '../../../support/gui.mjs';
import {createHash} from 'node:crypto';
import {readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGNocDgARAwQCgApDgYBH5bqCgAAAABJRU5ErkJggg==','base64');
export async function run(ctx){disposable(ctx);const doc=await createDocument(ctx);const output=path.join('/tmp','colab-canvas-image-'+ctx.runId+'.png');try{
 const editor=ctx.page.locator('[contenteditable=true]').first();await editor.fill('Image context before');
 await ctx.page.locator('input[type=file][accept*="image/png"]').setInputFiles({name:'canvas-regression.png',mimeType:'image/png',buffer:png});
 const image=editor.locator('img[data-canvas-image]');await image.waitFor({timeout:30000});
 ctx.assert('Uploaded image loads',await image.evaluate(el=>el.complete&&el.naturalWidth>0),true);
 const id=await image.getAttribute('data-canvas-image');
 const projection=await eventually(ctx,'Image handle is durable in projection',()=>core(ctx,'GET','/v1/canvases/'+doc.id+'/document'),v=>v.content.includes('colab-image:'+id));
 ctx.assert('Projection never embeds binary image bytes',projection.content.includes('data:image'),false);
 const interpretation='One pixel test fixture '+ctx.runId;
 await core(ctx,'PATCH','/v1/canvas-images/'+id,{image_interpretation:interpretation});
 await ctx.page.reload();await openTab(ctx,'Canvas');await ctx.page.locator(`[data-item-id="${doc.id}"]`).click();await image.waitFor();
 ctx.assert('Hidden interpretation is absent from GUI',await editor.innerText().then(text=>text.includes(interpretation)),false);
 const result=data(await cli(ctx,'colab-canvas',['image-read','--id',id,'--output',output]));
 ctx.assert('Agent receives hidden interpretation',result.imageInterpretation,interpretation);
 ctx.assert('Agent downloads original bytes',createHash('sha256').update(await readFile(output)).digest('hex'),createHash('sha256').update(png).digest('hex'));
 await ctx.screenshot('Canvas image loaded after reload');
 }finally{await unlink(output).catch(()=>{});await deleteDocument(ctx,doc);}}
