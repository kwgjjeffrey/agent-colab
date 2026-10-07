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

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["diagnosticLogFiles"]}};
export async function run(ctx){
const secret='REGRESSION_SECRET_'+crypto.randomUUID();const invalid='agent-colab-transfer://'+crypto.randomUUID()+'/'+secret;const error=await receiveTransfer(ctx,invalid,{expectFailure:true});ctx.assert('Receive error does not disclose bearer token',!JSON.stringify(error).includes(secret),true);const logs=parameter(ctx,'diagnosticLogFiles');for(const file of logs){const contents=await fs.readFile(file,'utf8');ctx.assert('General diagnostics redact capability: '+path.basename(file),!contents.includes(secret),true);}
}
