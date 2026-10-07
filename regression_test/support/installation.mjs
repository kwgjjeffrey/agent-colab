import path from 'node:path';import fs from 'node:fs/promises';import {parameter} from './client.mjs';
export function installRoot(ctx){return path.join(ctx.repo,'regression_test','.fixtures',ctx.runId,ctx.caseId,'installation');}
export async function setup(ctx,operation,manifest,args=[],{expectedCode=0}={}){const result=await ctx.command('Real sandbox installer '+operation,'python3',['regression_test/support/installer.py',installRoot(ctx),operation,'--manifest',manifest,'--server-url',parameter(ctx,'testServerUrl'),...args]);ctx.assert('Installer '+operation+' outcome',expectedCode===0?result.code===0:result.code!==0,true);return result;}
export async function receipt(ctx){return JSON.parse(await fs.readFile(path.join(installRoot(ctx),'installation.json'),'utf8'));}
export async function links(ctx){const root=path.join(installRoot(ctx),'current');return Object.fromEntries(await Promise.all(['core','ui','skill'].map(async name=>[name,await fs.readlink(path.join(root,name))])));}
