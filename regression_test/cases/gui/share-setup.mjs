export const USECASE={name:'Creation hints and executable Agent sharing setup',description:'Hover actual Add menu explanations. Obtain Files/Skill configuration prompts from GUI, read and execute their exact tool arguments on owned sources; verify Catalog placement, Files exclusions and scope replacement, Skill publication and cleanup. Only native chooser path is fixture-supplied.'};
export const META={id:'gui.sharing.agent-setup',module:'context/sharing/setup',surface:'gui',priority:'critical',origin:'requirement',status:'trial',effects:'isolated-write',cost:'normal',requires:['local-core'],affectedPaths:['desktop/ui/src/features/agent/ShareSetupPrompt.tsx','skills/colab/bin/colab-browser','skills/colab/bin/colab-explorer'],suite:'business',testLevel:'end-to-end',locks:['read:client.primary','read:channel.shared']};
export const REQUIREMENTS={channel:{permission:'read'},parameters:{keys:['nativeChooserBoundary','secondCoreDiscoveryFile']}};
import fs from 'node:fs/promises';import path from 'node:path';
import {core,cli,data,resource,eventually,parameter} from '../../support/client.mjs';
import {fixtures} from '../../support/fixtures.mjs';import {openTab,addItem} from '../../support/gui.mjs';import {withPathSelection} from '../../support/selection.mjs';

export async function run(ctx){
 const f=await fixtures(ctx),channel=resource(ctx,'channel'),channelRef='colab://channel/'+encodeURIComponent(channel.id);
 await fs.mkdir(path.join(f.files,'dist'),{recursive:true});await fs.writeFile(path.join(f.files,'dist','excluded.txt'),'EXCLUDE_ME');
 let catalog,files,skill;
 const invoke=async line=>{
  // Keep the generated arguments unchanged; execute the candidate packaged tool
  // rather than the daily installed target, whose version has not been promoted yet.
  const match=line.match(/^~\/\.agents\/skills\/agent-colab\/bin\/(colab-[\w-]+)(.*)$/);
  if(!match)throw new Error('Unexpected generated command');
  const executable=path.join(ctx.repo,'dist/colab-skill/0.1.56-dev/bin',match[1]);
  const result=await ctx.command('Execute generated '+match[1],'bash',['-c',"'"+executable+"'"+match[2]]);
  ctx.assert('Generated command exits successfully',result.code,0);return data(JSON.parse(result.stdout));
 };
 try{
  catalog=data(await cli(ctx,'colab-explorer',['create-catalog','--parent',channelRef,'--name','Setup '+ctx.runId]));
  const created=(await core(ctx,'GET',`/v1/channels/${channel.id}/catalog-items?limit=200`)).find(row=>row.kind==='catalog'&&row.name==='Setup '+ctx.runId);
  catalog.explorerRef=`colab://resource/${channel.id}/catalog/${created.id}`;
  await openTab(ctx,'Home');await ctx.page.getByRole('button',{name:'Add',exact:true}).click();
  for(const [name,text]of [['Catalog','Group and organize context documents.'],['Canvas','A shared document people and Agents can edit simultaneously.'],['Session','Share your local Agent conversation so teammates can help or explore it with their own Agents.'],['Files','Share your local files or directories.'],['Skill','Share a reusable Skill that teammates can install in their Agents.']]){
   await ctx.page.getByRole('menuitem',{name,exact:true}).hover();const hint=ctx.page.locator('[data-slot="tooltip-content"]').filter({hasText:text});await hint.waitFor();ctx.assert(name+' hover explanation',await hint.innerText(),text);
  }
  await ctx.page.keyboard.press('Escape');
  // Use Catalog's own Add so the prompt must retain its exact destination.
  await ctx.page.reload();const row=ctx.page.locator(`[data-item-id="${catalog.explorerRef.split('/').at(-1)}"]`);await row.waitFor();await row.hover();
  await row.getByRole('button',{name:'Add to Setup '+ctx.runId,exact:true}).click();
  await withPathSelection(ctx,f.files,async()=>{await ctx.page.getByRole('menuitem',{name:'Files',exact:true}).click();await ctx.page.getByRole('dialog').getByRole('button',{name:'Give to Agent',exact:true}).click();});
  const dialog=ctx.page.getByRole('dialog').filter({has:ctx.page.getByRole('heading',{name:'Share Files with Agent',exact:true})});
  const prompt=await dialog.locator('pre').innerText();ctx.assert('Files prompt is bounded to selected source',prompt.includes(f.files),true);ctx.assert('Files prompt uses selected Catalog',prompt.includes(catalog.explorerRef),true);
  const commands=prompt.split('\n').filter(line=>line.startsWith('~/.agents/'));
  for(const line of commands){const output=await invoke(line);if(line.includes(' inspect-source '))ctx.assert('Inspection excludes dist',output.excludedFiles,1);if(line.includes(' share '))files=output;}
  await ctx.screenshot('Files setup prompt');await ctx.page.keyboard.press('Escape');await ctx.page.keyboard.press('Escape');
  const fileId=files.stableRef.split('/').at(-1);
  await eventually(ctx,'Files publication ready',()=>core(ctx,'GET',`/v1/channels/${channel.id}/files`),rows=>rows.some(row=>row.id===fileId&&row.currentRootOid),{timeoutMs:90000});
  // Contributor use deliberately returns the original source; verify published bytes
  // on the separate receiver Core, where no source path is registered.
  const snapshot=await core(ctx,'POST',`/v1/files/${fileId}/materialize`,undefined,{discoveryFile:parameter(ctx,'secondCoreDiscoveryFile')});
  ctx.assert('Published snapshot excludes generated file',await fs.access(path.join(snapshot.localPath,'dist/excluded.txt')).then(()=>true,()=>false),false);
  ctx.assert('Published bytes retain allowed content',await fs.readFile(path.join(snapshot.localPath,'hello.txt'),'utf8'),'OWNED_TEST_'+ctx.runId);
  await cli(ctx,'colab-browser',['sync-scope','--ref',files.stableRef]);
  await cli(ctx,'colab-browser',['sync-scope','--ref',files.stableRef,'--set']);
  const scope=data(await cli(ctx,'colab-browser',['sync-scope','--ref',files.stableRef]));ctx.assert('Replacing with empty list clears exclusion',scope.excludedFiles,0);
  await openTab(ctx,'Home');await addItem(ctx,'Skill');await ctx.page.getByRole('dialog').getByRole('button',{name:'Give to Agent',exact:true}).click();
  const skillDialog=ctx.page.getByRole('dialog').filter({has:ctx.page.getByRole('heading',{name:'Share a Skill with Agent',exact:true})});
  const skillPrompt=await skillDialog.locator('pre').innerText();ctx.assert('Skill prompt chooses one root',skillPrompt.includes('one Skill root containing a valid SKILL.md'),true);
  for(const line of skillPrompt.split('\n').filter(line=>line.startsWith('~/.agents/'))){const output=await invoke(line.replace("'<absolute-source-path>'","'"+f.skill+"'"));if(line.includes(' share '))skill=output;}
  await ctx.screenshot('Skill setup prompt');await ctx.page.keyboard.press('Escape');await ctx.page.keyboard.press('Escape');
  await eventually(ctx,'Skill publication ready',()=>core(ctx,'GET',`/v1/channels/${channel.id}/skills`),rows=>rows.some(row=>row.id===skill.stableRef.split('/').at(-1)&&row.currentRootOid),{timeoutMs:90000});
  const children=data(await cli(ctx,'colab-explorer',['open','--ref',catalog.explorerRef]));ctx.assert('Shared Files stays in chosen Catalog',children.items.some(item=>item.stableRef===files.stableRef),true);
 }finally{
  for(const share of [files,skill])if(share)await cli(ctx,'colab-browser',['withdraw','--item',share.stableRef]);
  if(catalog)await cli(ctx,'colab-explorer',['remove-catalog','--ref',catalog.explorerRef]);
 }
}
