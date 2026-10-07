export const USECASE = {
  "name": "Create a fixed Quick Share snapshot",
  "description": "Purpose: One-time handoff has a different lifetime from Channel sharing.\n\nPreconditions: Disposable Files, Session and Skill fixture sources exist.\n\nActions: Select sources, set expiry and create a Quick Share; then change the sources.\n\nExpected results: The returned share represents the selected snapshot and does not follow later source updates or grant Channel membership."
};

export const META = {
  "id": "quick-share.creation.snapshot",
  "module": "quick-share/sharing",
  "surface": "gui",
  "priority": "critical",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [
    "local-core"
  ],
  "affectedPaths": [
    "desktop/ui/src/features/transfers",
    "skills/colab/bin/colab-transfer"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {ownedFiles} from "../../../support/fixtures.mjs";
import {openTab} from "../../../support/gui.mjs";
import {withPathSelection} from "../../../support/selection.mjs";
import {receiveTransfer,revokeTransfer} from "../../../support/transfers.mjs";

export const REQUIREMENTS={"channel": {"permission": "read"}, "parameters": {"keys": ["nativeChooserBoundary"]}};
export async function run(ctx){
const source=await ownedFiles(ctx);await openTab(ctx,'Messages');let transfer;await withPathSelection(ctx,source,async()=>{await ctx.page.getByRole('button',{name:'Quick Share',exact:true}).click();await ctx.page.getByRole('menuitem',{name:'Share Files',exact:true}).click();const response=ctx.page.waitForResponse(r=>r.url().endsWith('/v1/transfers')&&r.request().method()==='POST');await ctx.page.getByRole('dialog').getByRole('button',{name:'Choose Files',exact:true}).click();transfer=await (await response).json();});ctx.assert('GUI creates a real fixed transfer',!!transfer.transferId,true);try{await fs.writeFile(path.join(source,'hello.txt'),'CHANGED_AFTER_SHARE');const received=await receiveTransfer(ctx,transfer.capability);ctx.assert('Fixed Files snapshot preserves original content',await fs.readFile(path.join(received.items[0].localPath,'hello.txt'),'utf8'),'OWNED_TEST_'+ctx.runId);}finally{await revokeTransfer(ctx,transfer.transferId);}
}
