import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schema,parser,render,patch,run,parseProjection} from './codec.mjs';
import * as Y from 'yjs';
import {prosemirrorJSONToYDoc,yXmlFragmentToProseMirrorRootNode} from '@tiptap/y-tiptap';
const t=text=>({type:'text',text}),p=(...content)=>({type:'paragraph',content});
const mention={type:'mention',attrs:{id:'agent',label:'Runtime Validation Agent',kind:'agent',mentionId:'first'}};
const fixture=schema.nodeFromJSON({type:'doc',content:[{type:'heading',attrs:{level:1},content:[t('Heading 1')]},p(t('This is a test on this canvas'),{type:'hardBreak'},t('reply me exactly what you see, and append below this line '),mention),p(),p(t('This is another line '),{...mention,attrs:{...mention.attrs,mentionId:'second'}})]});
for(const kind of ['files','session','canvas','message'])test(`${kind} resource capsule round-trip and adjacent patch preserve exact identity`,()=>{
 const id='b9b0bf8c-98e7-48db-9a88-4fb5926d51af';
 const n=schema.nodeFromJSON({type:'doc',content:[p(t('Read '),{type:'mention',attrs:{kind,id,label:'设计 [方案]',mentionId:'occurrence'}},t(' before acting'))]});
 const md=render(n);assert(md.includes(`colab:${kind}:${id}`));assert(parseProjection(n,md).eq(n));
 const next=patch(n,' before acting',' before implementing');assert.deepEqual(next.firstChild.child(1).attrs,n.firstChild.child(1).attrs);
 assert.throws(()=>patch(n,id,'a9b0bf8c-98e7-48db-9a88-4fb5926d51af'),/protected_content_changed|projection/);
});
test('user and agent capsules plus component fence round-trip without identity loss',()=>{
 const n=schema.nodeFromJSON({type:'doc',content:[p(mention,t(' '),{type:'mention',attrs:{id:'user-id',label:'Same display name',kind:'user',mentionId:'user-occurrence'}}),{type:'codeBlock',attrs:{language:'colab-component'},content:[t('{"id":"query-id","filter":{"owner":"user-id"}}')]}]});
 assert(parseProjection(n,render(n)).eq(n));
 assert.throws(()=>patch(n,'"user-id"','"another-user"'),/protected_content_changed/);
});
test('real request shape appends paragraphs and preserves both mentions and blank paragraph',()=>{
 const projection=render(fixture),line=projection.split('\n').find(l=>l.includes('reply me'));
 const next=patch(fixture,line,line+'\n\nAppended response');
 assert.equal(next.childCount,5);assert.equal(next.child(2).textContent,'Appended response');assert(next.child(1).eq(fixture.child(1)));assert(next.child(3).eq(fixture.child(2)));assert(next.lastChild.eq(fixture.lastChild));
});
test('protect mention identity',()=>{const s=render(fixture);const link=s.match(/\[@Runtime[^\n]+?\)/)[0];assert.throws(()=>patch(fixture,'reply me exactly what you see, and append below this line '+link,'removed'),/protected_content_changed/);});
test('actual document terminal space and hard break preserve on append',()=>{
 const n=schema.nodeFromJSON({type:'doc',content:[p(t('First line'),{type:'hardBreak'},t('Append here '),mention,t(' '),{type:'hardBreak'})]});
 assert(parseProjection(n,render(n)).eq(n));
 const line=render(n).split('\n').find(l=>l.includes('Append here'));
 const next=patch(n,line,line+'\n\nResponse');assert(next.firstChild.eq(n.firstChild));assert.equal(next.lastChild.textContent,'Response');
});
test('ambiguous context rejects before mutation',()=>{assert.throws(()=>patch(fixture,'This is','Other'),/ambiguous/);});
test('affected multiline heading refuses lossy edit',()=>{const n=schema.nodeFromJSON({type:'doc',content:[{type:'heading',attrs:{level:1},content:[t('one'),{type:'hardBreak'},t('two')]}]});assert.throws(()=>patch(n,'one','new'),/projection_not_representable/);});
test('incremental update converges with unrelated remote edit',()=>{
 const a=prosemirrorJSONToYDoc(schema,fixture.toJSON(),'default'),b=new Y.Doc();Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const sv=Y.encodeStateVector(b);
 const line=render(fixture).split('\n').find(l=>l.includes('reply me'));
 const out=run({operation:'patch',state:Buffer.from(Y.encodeStateAsUpdate(a)).toString('base64'),old:line,new:line+'\n\nResponse'});
 b.getXmlFragment('default').get(0).get(0).insert(0,'Remote ');const remote=Y.encodeStateAsUpdate(b,sv);
 Y.applyUpdate(a,Buffer.from(out.update,'base64'));Y.applyUpdate(a,remote);Y.applyUpdate(b,Buffer.from(out.update,'base64'));Y.applyUpdate(b,Buffer.from(out.update,'base64'));
 const na=yXmlFragmentToProseMirrorRootNode(a.getXmlFragment('default'),schema),nb=yXmlFragmentToProseMirrorRootNode(b.getXmlFragment('default'),schema);assert(na.eq(nb));assert.equal(na.firstChild.textContent,'Remote Heading 1');assert.equal(na.child(2).textContent,'Response');
});

test('Server welcome fixture hydrates the real editor and remains editable through the Agent codec',async()=>{
 const {readFileSync}=await import('node:fs');
 const bytes=readFileSync(new URL('../../server/standalone/crates/persistence/assets/welcome-canvas.yjs',import.meta.url));
 const doc=new Y.Doc();Y.applyUpdate(doc,bytes);
 const node=yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment('default'),schema);
 const content=render(node);
 assert(content.includes('# Welcome to Canvas'));
 assert(content.includes('Adding a mention alone does not start work.'));
 assert(content.includes('Project brief:'));
 const result=run({state:Buffer.from(bytes).toString('base64'),operation:'patch',old:'## Typical uses',new:'## Our team’s uses'});
 Y.applyUpdate(doc,Buffer.from(result.update,'base64'));
 assert(render(yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment('default'),schema)).includes('## Our team’s uses'));
});

test('image handles and resized geometry survive projection, text patch and Yjs replay',()=>{
 const id='550e8400-e29b-41d4-a716-446655440000';
 const node=schema.nodeFromJSON({type:'doc',content:[p(t('Before')), {type:'image',attrs:{attachmentId:id,src:`/v1/canvas-images/${id}/content`,width:320,height:200}},p(t('After'))]});
 assert(parser.parse(render(node)).eq(node));
 const next=patch(node,'Before','Changed');assert(next.child(1).eq(node.child(1)));
 const doc=prosemirrorJSONToYDoc(schema,node.toJSON(),'default');
 const out=run({operation:'patch',state:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),old:'After',new:'Updated'});
 Y.applyUpdate(doc,Buffer.from(out.update,'base64'));
 assert(yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment('default'),schema).child(1).eq(node.child(1)));
});

test('dependent update without its baseline fails instead of reading empty; replay repairs it',()=>{
 const doc=prosemirrorJSONToYDoc(schema,{type:'doc',content:[p(t('Planning'))]},'default');
 const seed=Y.encodeStateAsUpdate(doc),vector=Y.encodeStateVector(doc);
 doc.getXmlFragment('default').get(0).get(0).insert(8,' items');
 const delta=Y.encodeStateAsUpdate(doc,vector),receiver=new Y.Doc();Y.applyUpdate(receiver,delta);
 const read=()=>run({operation:'render',state:Buffer.from(Y.encodeStateAsUpdate(receiver)).toString('base64')});
 assert.throws(read,/canvas_sync_incomplete/);
 Y.applyUpdate(receiver,seed);assert.equal(read().content,'Planning items\n');
 Y.applyUpdate(receiver,seed);assert.equal(read().content,'Planning items\n');
});

 test('compact member references omit editor metadata and preserve distinct occurrences',()=>{
 const attrs={id:'df6668c8-dc29-4548-a1e6-92c0805c56c7',kind:'member',label:'郭航宇',mentionId:'first'};
 const n=schema.nodeFromJSON({type:'doc',content:[p({type:'mention',attrs},t(' and '),{type:'mention',attrs:{...attrs,mentionId:'second'}},t(' task'))]});
 const text=render(n);assert(text.includes('[@郭航宇](colab:member:'+attrs.id+')'));assert(!text.includes('mentionId'));assert(!text.includes('eyJ'));assert(text.length<160);
 const next=patch(n,' task',' work');assert.deepEqual(next.firstChild.child(0).attrs,n.firstChild.child(0).attrs);assert.deepEqual(next.firstChild.child(2).attrs,n.firstChild.child(2).attrs);
 assert.throws(()=>patch(n,attrs.id,'another'),/ambiguous|protected_content_changed/);
 const legacy='[@郭航宇](colab-mention:'+Buffer.from(JSON.stringify(n.firstChild.child(0).attrs)).toString('base64url')+')';assert.deepEqual(parser.parse(legacy).firstChild.firstChild.attrs,n.firstChild.child(0).attrs);
 });
