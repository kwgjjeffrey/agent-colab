export const USECASE = {
  "name": "Route a mention to the intended Agent",
  "description": "Purpose: A mention must route by identity rather than a display-name guess.\n\nPreconditions: A disposable Channel contains an authorized test Agent participant.\n\nActions: Send a message with one stable Agent mention and inspect request state and reply.\n\nExpected results: Exactly that blueprint receives one command; visible mention text and stored rich identity remain intact."
};

export const META = {
  "id": "agents.invocation.mention",
  "module": "agents/invocation",
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
    "desktop/ui/src/features/agent",
    "server/standalone/src",
    "local/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end",
  "statusReason": "Reviewed 20261007T102452Z-cbabd0e6, execution source b54f5dc4ec79: Actual GUI mention creates the intended request; real runtime success and request-linked reply are verified.",
  "locks": [
    "read:client.primary",
    "read:channel.shared",
    "write:runtime.bound",
    "read:agent.blueprint",
    "read:client.owner",
    "read:browser.navigation"
  ]
};

import {invoke,complete} from "../../../support/agent.mjs";
import {parameter,resource,core,cli,data,disposable} from "../../../support/client.mjs";
export async function run(ctx){const task=await invoke(ctx,{gui:true});await complete(ctx,task);await ctx.screenshot('Real Agent completed');}

export const REQUIREMENTS={"channel": {"permission": "read"}, "agent": {"state": "online", "capability": "execute"}};
