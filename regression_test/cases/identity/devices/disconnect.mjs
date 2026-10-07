export const USECASE = {
  "name": "Inspect and disconnect an owned device",
  "description": "Purpose: Device management must affect real authorization.\n\nPreconditions: A disposable second device session belongs to the test account.\n\nActions: Open account Devices, disconnect that session, then retry protected work from it.\n\nExpected results: The selected device loses authorization; the current device remains usable and the GUI reports the actual outcome."
};

export const META = {
  "id": "identity.devices.disconnect",
  "module": "identity/devices",
  "surface": "gui",
  "priority": "normal",
  "origin": "requirement",
  "status": "active",
  "effects": "isolated-write",
  "cost": "normal",
  "requires": [],
  "affectedPaths": [
    "desktop/ui/src/main.tsx",
    "local/src",
    "server/standalone/src"
  ],
  "suite": "business",
  "testLevel": "end-to-end"
};

import fs from "node:fs/promises";import path from "node:path";
import {parameter,resource,core,cli,data,disposable,eventually} from "../../../support/client.mjs";
import {isolated} from "../../../support/controls.mjs";

export const REQUIREMENTS={"parameters": {"keys": ["isolationConfirmed", "isolatedClientBaseUrl", "isolatedCoreDiscoveryFile", "disposableDeviceId", "revocableCoreDiscoveryFile"]}};
export async function run(ctx){
const target=await isolated(ctx),deviceId=parameter(ctx,'disposableDeviceId'),other=parameter(ctx,'revocableCoreDiscoveryFile');const devices=await core(ctx,'GET','/v1/auth/devices',undefined,target);const device=devices.find(x=>x.id===deviceId);ctx.assert('Revocation fixture is a non-current device',!!device&&!device.current,true);await ctx.page.goto(target.baseUrl);await ctx.page.getByRole('button',{name:'Settings',exact:true}).click();await ctx.page.getByRole('button',{name:/Linked devices/i}).click();const row=ctx.page.locator('div.rounded-lg.border').filter({hasText:device.name});ctx.assert('Disposable device row is unique',await row.count(),1);await row.getByRole('button',{name:'Unlink',exact:true}).click();await ctx.page.getByRole('alertdialog').getByRole('button',{name:'Unlink',exact:true}).click();await eventually(ctx,'Disposable device is disconnected',()=>core(ctx,'GET','/v1/auth/devices',undefined,target),rows=>!rows.some(x=>x.id===deviceId));const denied=await core(ctx,'GET','/v1/channels',undefined,{discoveryFile:other,expectFailure:true});ctx.assert('Disconnected device cannot access protected resources',/HTTP 401/.test(denied.error),true);ctx.assert('Current device retains authority',Array.isArray(await core(ctx,'GET','/v1/channels',undefined,target)),true);
}
