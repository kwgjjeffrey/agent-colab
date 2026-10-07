export const USECASE = {
  "name": "Keep capability secrets out of diagnostics",
  "description": "Purpose: Bearer capabilities must not leak through observability.\n\nPreconditions: A controlled capability can produce success and error output.\n\nActions: Exercise receive and malformed-token errors; inspect logs and trace attributes.\n\nExpected results: Tokens are absent from general logs and errors; only safe fingerprints appear; the intentional handoff prompt is handled as secret-bearing content.\n\nExecution boundary: verify this contract with controlled inputs through its owning API or adapter; a full browser journey is unnecessary."
};

export const META = {
  "id": "quick-share.security.redaction",
  "module": "quick-share/access",
  "surface": "integration",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "read-only",
  "cost": "fast",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ],
  "suite": "business",
  "testLevel": "contract"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {receiveTransfer} from "../../../support/transfers.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["diagnosticLogFiles", "traceProviderConfig"]}};
export async function run(ctx){
const secret='REGRESSION_SECRET_'+crypto.randomUUID(),traceId=crypto.randomUUID().replaceAll('-',''),parentId=crypto.randomUUID().replaceAll('-','').slice(0,16);const config=await core(ctx,'GET','/v1/observability/config');if(!config.enabled)ctx.block('Privacy trace verification requires enabled project tracing');const invalid='agent-colab-transfer://'+crypto.randomUUID()+'/'+secret;const response=await ctx.command('Correlated private receive request','python3',['regression_test/support/traced_core.py'],{input:JSON.stringify({capability:invalid,traceId,parentId}),capture:false});ctx.assert('Correlated request transport completes',response.code,0);const error=JSON.parse(response.stdout);ctx.assert('Invalid capability is denied',[400,401,403,404,410].includes(error.status),true);ctx.assert('Receive error does not disclose bearer token',!error.body.includes(secret),true);for(const file of parameter(ctx,'diagnosticLogFiles')){const contents=await fs.readFile(file,'utf8');ctx.assert('General diagnostics redact capability: '+path.basename(file),!contents.includes(secret),true);}const skill=process.env.TRACE_INSTALL_DIR||path.join(os.homedir(),'.codex/skills/trace');let observed;for(let i=0;i<20;i++){const result=await ctx.command('Read the controlled provider trace','sh',[path.join(skill,'setup/run.sh'),'trace.mjs','trace','--repo',ctx.repo,'--config',parameter(ctx,'traceProviderConfig'),'--id',traceId],{capture:false});if(result.code===0){const value=JSON.parse(result.stdout);if(value.traceId===traceId&&value.spans?.some(s=>s.attributes?.['trace.operation.id']==='core.transfers.receive-transfer'||s.attributes?.['colab.operation']==='core.transfers.receive-transfer')){observed=value;break;}}await new Promise(r=>setTimeout(r,2000));}if(!observed)ctx.block('The controlled receive span was not available from the configured provider');ctx.assert('Provider trace attributes contain no bearer capability',!JSON.stringify(observed).includes(secret),true);
}

import os from "node:os";
