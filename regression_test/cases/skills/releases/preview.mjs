import fs from 'node:fs/promises';
import {core} from '../../../support/client.mjs';
export const USECASE = {
  name: 'Preview the published Colab Skill release in its Channel',
  description: 'Use the real published Colab Skill receipt. Select its exact mixed Catalog item, verify the current version and release history, rendered documentation and existing Give to Agent consumption instruction.',
};
export const META = {
  "id": "skills.releases.preview",
  "module": "skills/releases",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "locks": [
    "read:client.primary",
    "read:skill.release-acceptance"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/skills/SkillsView.tsx"
  ],
  "statusReason": "Reviewed Run 20261013T052633Z-db6b227b: actual GUI 183 and Core 128, exact published reference, version/history, rendered Colab documentation and existing consumption handoff; read-only assertions and screenshot verified."
};
export async function run(ctx) {
  const {data} = JSON.parse(await fs.readFile('.trial/skill-releases/publication.json','utf8'));
  const channels = await core(ctx, 'GET', '/v1/channels');
  const channel = channels.find(c => c.id === data.stableRef.split('/')[3]);
  ctx.assert('Published Channel is accessible', Boolean(channel), true);
  await ctx.page.locator('[aria-label="Channels"]').getByRole('button',{name:channel.name,exact:true}).click();
  const row = ctx.page.locator(`[data-item-id="${data.referenceId}"][data-item-kind="skill"]`);
  await row.click();
  await ctx.page.locator('[data-trace-region="skill-preview"]').waitFor();
  const history = ctx.page.locator('details').filter({hasText:`Version ${data.version}`});
  await history.waitFor();
  ctx.assert('Documentation is rendered', (await ctx.page.locator('[data-trace-region="skill-preview"]').innerText()).includes('Publish a Skill artifact to a Channel'), true);
  await history.locator('summary').click();
  ctx.assert('Immutable version is in history', await history.locator('li').getByText(data.version,{exact:true}).count(), 1);
  await ctx.page.getByRole('button',{name:'Give to Agent',exact:true}).click();
  const prompt = await ctx.page.getByRole('dialog').locator('pre').innerText();
  ctx.assert('Existing installer remains the consumption path', prompt.includes('colab-skill-tool') && prompt.includes('ensure'), true);
  await ctx.page.keyboard.press('Escape');
  await ctx.page.getByRole('button',{name:'Add',exact:true}).click();
  await ctx.page.getByRole('menuitem',{name:'Skill',exact:true}).click();
  await ctx.page.getByRole('button',{name:'Publish as Artifact',exact:true}).click();
  const artifactDialog=ctx.page.getByRole('dialog').filter({has:ctx.page.getByRole('heading',{name:'Publish a Skill Artifact',exact:true})});
  const publicationPrompt=await artifactDialog.locator('pre').innerText();
  ctx.assert('Artifact prompt includes exact Channel and real scaffold',publicationPrompt.includes(channel.id)&&publicationPrompt.includes('colab-skill-release init')&&publicationPrompt.includes('scripts/publish-colab-skill.py'),true);
  ctx.assert('Artifact prompt retains Catalog destination',publicationPrompt.includes('--parent'),true);
  await ctx.screenshot('Project Skill artifact publication prompt');
  await ctx.page.keyboard.press('Escape');
  await ctx.page.getByRole('dialog').filter({has:ctx.page.getByRole('heading',{name:'Share a Skill',exact:true})}).waitFor();
  ctx.assert('Cancel preserves directory-sharing dialog',await ctx.page.getByRole('button',{name:'Choose Skill folder',exact:true}).count(),1);
  await ctx.page.keyboard.press('Escape');
}
