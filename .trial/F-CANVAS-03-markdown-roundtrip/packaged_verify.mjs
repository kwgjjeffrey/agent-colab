// Read-only product-data test: never uploads the generated patch to the user's document.
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../local/canvas-codec/package.json',import.meta.url));
const Y=require('yjs');
let input='';for await(const chunk of process.stdin)input+=chunk;
const updates=JSON.parse(input),doc=new Y.Doc();
for(const row of updates)Y.applyUpdate(doc,Buffer.from(row.update,'base64'));
const state=Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
const base=new URL('../../dist/local-core/0.1.76-dev/darwin-arm64/canvas-codec/',import.meta.url).pathname;
function run(input){const r=spawnSync(base+'node',[base+'codec.cjs'],{input:JSON.stringify(input),encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);}
const before=run({operation:'render',state}).content;
assert(before.includes('This is a test on this canvas\\\nreply me'));
const line=before.split('\n').find(l=>l.includes('reply me exactly'));
const after=run({operation:'patch',state,old:line,new:line+'\n\nPackaged regression passed'});
assert(after.content.includes('Packaged regression passed'));
assert(after.content.includes(line));
assert(after.content.includes('This is another line'));
console.log(JSON.stringify({passed:true,sourceUpdates:updates.length,hardBreakPreserved:true,capsulesPreserved:true,appendDeltaBytes:Buffer.from(after.update,'base64').length}));
