export const USECASE={name:'Focus preserves the workspace and Channel Settings uses real images',description:'Use a disposable Channel. Select Skills and observe true action gutters. Trigger repeated window focus, count main-frame navigations, then reload and verify saved tab and Channel. Upload a case-owned PNG and generate a local icon through Settings, save and read each image back through Local Core. Restore the original name/icon in finally.'};
export const META={id:'channels.onboarding.workspace',module:'channels/onboarding',surface:'gui',priority:'critical',origin:'bug',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/main.tsx','desktop/ui/src/features/channels','desktop/ui/src/features/skills'],suite:'business',testLevel:'end-to-end'};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['disposable']}};
import {core,resource,disposable,eventually} from '../../../support/client.mjs';
import {openTab} from '../../../support/gui.mjs';
export async function run(ctx){
 disposable(ctx);const channel=resource(ctx,'channel'),original=(await core(ctx,'GET','/v1/channels')).find(x=>x.id===channel.id);
 await openTab(ctx,'Skills');const button=ctx.page.getByRole('button',{name:'Share skill',exact:true});const box=await button.boundingBox();const size=await ctx.page.evaluate(()=>({width:innerWidth,tabBottom:document.querySelector('[role=tablist]').getBoundingClientRect().bottom}));
 ctx.assert('Skill action has a right gutter',size.width-box.x-box.width>=16,true);ctx.assert('Skill action has a top gutter',box.y-size.tabBottom>=16,true);
 let navigations=0;const onNavigation=frame=>{if(frame===ctx.page.mainFrame())navigations++;};ctx.page.on('framenavigated',onNavigation);
 try{for(let i=0;i<3;i++){const checked=ctx.page.waitForResponse(r=>new URL(r.url()).pathname==='/ui.json');await ctx.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await (await checked).finished();await ctx.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}ctx.assert('Repeated focus never reloads unchanged GUI',navigations,0);}finally{ctx.page.off('framenavigated',onNavigation);}
 await ctx.page.reload();await ctx.page.getByRole('tab',{name:'Skills',exact:true}).waitFor();ctx.assert('Cold renderer restores Skills tab',await ctx.page.getByRole('tab',{name:'Skills',exact:true}).getAttribute('aria-selected'),'true');
 ctx.assert('Cold renderer restores the selected Channel',await ctx.page.getByRole('heading',{name:channel.name,exact:true}).isVisible(),true);
 try{
 await openTab(ctx,'Settings');const form=ctx.page.locator('[data-trace-target~="channels.update"]');
 ctx.assert('Icon is not a text field',await form.locator('input[name="icon"][type="text"]').count(),0);
 await form.getByLabel('Channel icon image',{exact:true}).setInputFiles({name:'owned-icon.png',mimeType:'image/png',buffer:Buffer.from(await ctx.page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const context=canvas.getContext('2d');context.fillStyle='#247ba0';context.fillRect(0,0,32,32);return canvas.toDataURL('image/png').split(',')[1];}),'base64')});
 await form.getByRole('button',{name:'Save changes',exact:true}).click();
 const uploaded=await eventually(ctx,'Uploaded icon stored as an image',()=>core(ctx,'GET','/v1/channels'),rows=>rows.find(x=>x.id===channel.id)?.icon?.startsWith('data:image/png;'));
 ctx.assert('Uploaded icon is stored',uploaded.find(x=>x.id===channel.id).icon.startsWith('data:image/png;'),true);
 await form.getByRole('button',{name:'Generate icon',exact:true}).click();await form.getByRole('button',{name:'Save changes',exact:true}).click();
 const generated=await eventually(ctx,'Generated icon saved as SVG image',()=>core(ctx,'GET','/v1/channels'),rows=>rows.find(x=>x.id===channel.id)?.icon?.startsWith('data:image/svg+xml;'));
 const source=generated.find(x=>x.id===channel.id).icon;const headerImage=ctx.page.getByRole('heading',{name:channel.name,exact:true}).locator('..').locator('img');await eventually(ctx,'Header shows the persisted icon',()=>headerImage.getAttribute('src'),src=>src===source);ctx.assert('Header image decodes',await headerImage.evaluate(img=>img.complete&&img.naturalWidth>0),true);ctx.assert('Rail uses the persisted image',await ctx.page.getByRole('button',{name:channel.name,exact:true}).locator('img').getAttribute('src'),source);
 await ctx.screenshot('Image identity and generated icon');
 }finally{await core(ctx,'PATCH','/v1/channels/'+channel.id,{name:original.name,icon:original.icon});await eventually(ctx,'Original Channel identity restored',()=>core(ctx,'GET','/v1/channels'),rows=>rows.some(x=>x.id===channel.id&&x.name===original.name&&x.icon===original.icon));}
}
