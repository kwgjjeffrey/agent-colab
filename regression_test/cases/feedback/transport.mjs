export const USECASE = {
  name: 'Collect and review private Skill feedback through Core and Server',
  description: `Preconditions: candidate Rust binaries and local PostgreSQL tools exist.
Actions: start isolated PostgreSQL, Server and Core; queue a pre-captured synthetic fragment;
verify raw upload without model evaluation, use producer CLI lists, read the fragment through
colab-session-reader, mark the feedback ignored with a current revision, and test an outsider.
Expected: all real transport operations succeed, outsider evidence access is forbidden,
no real user transcript is uploaded, and isolated processes/files are cleaned up.`,
};
export const META = {
  "id": "feedback.transport.private-owner-review",
  "module": "feedback/transport",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "testLevel": "contract",
  "suite": "business",
  "locks": [],
  "affectedPaths": [
    "local/crates/local-api/src/feedback.rs",
    "server/standalone/crates/api/src/feedback.rs",
    "skills/colab/bin/colab-feedback"
  ],
  "statusReason": "Reviewed Run 20261010T024724Z-ba31f69e: real isolated Core/Server, 12 assertions, synthetic-only evidence, digest corruption rejection, owner scope, process/file cleanup verified."
};
export async function run(ctx) {
  const result=await ctx.command('Run isolated feedback transport','python3',['.trial/V-FEEDBACK-03-implementation/transport-e2e.py']);
  ctx.assert('All transport operations exit successfully',result.code,0);
  if(result.code!==0)return;
  const value=JSON.parse(result.stdout.trim().split('\n').at(-1));
  for(const key of ['coreUpload','analysisDisabledRawStillUploaded','producerListAssets','producerListFeedbacks','existingSessionReader','resolutionCommand','outsiderDenied','markdownCommentUpload','negativeTagFiltering','readerRejectsCorruptEvidence'])ctx.assert(key,value[key],true);
  ctx.assert('No real conversation upload',value.realUserConversationUploaded,false);
}
