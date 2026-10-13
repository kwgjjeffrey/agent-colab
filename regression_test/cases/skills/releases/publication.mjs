export const USECASE = {
  name: 'Publish and consume Colab itself as an immutable Skill artifact',
  description: `Start a disposable PostgreSQL, Server and authenticated Core. Publish the canonical Colab Skill ZIP, retry, reject changed bytes at the same version, publish a new version, preview and install through existing consumers. Verify rollback/update and a distinct collaborator's publication followed by permission revocation. Remove the temporary native installation and stop every owned service.`,
};
export const META = {
  "id": "skills.releases.publication",
  "module": "skills/releases",
  "surface": "skill",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "covers": [],
  "requires": [],
  "locks": [
    "write:agent-target.claude"
  ],
  "affectedPaths": [
    "local/crates/local-api/src/skill_releases.rs",
    "local/crates/local-api/src/skills.rs",
    "server/standalone/crates/persistence/src/skill_releases.rs",
    "skills/colab/bin/colab-skill-release"
  ],
  "statusReason": "Reviewed Run 20261013T053707Z-497d5063 repaired round: canonical Colab package, real Core/Server/PostgreSQL, scaffold/readback/immutable versions/native installation/rollback, distinct publisher grant/revocation, watched-directory update and withdrawal. Owned temporary installations/services removed; initial test timing and stale-receipt failures retained."
};
export async function run(ctx) {
  const result = await ctx.command('Run isolated Skill publication and native consumption', 'python3', ['regression_test/support/skill-release-e2e.py']);
  ctx.assert('Full lifecycle exits successfully', result.code, 0);
  if (result.code !== 0) return;
  const value = JSON.parse(result.stdout.trim().split('\n').at(-1));
  for (const key of ['selfSkillArchivePublished','immutableRetryReused','changedSameVersionRejected','stableChannelReference','twoVersionsRetained','existingPreviewConsumer','noSourceWatcherRegistered','nativeInstallationAndEntrypoint','rollbackAndUpdate','collaboratorPublication','revocationEnforced','scaffoldTarget','directorySyncUnchanged']) {
    ctx.assert(key, value[key], true);
  }
}
