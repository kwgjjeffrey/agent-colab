import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getSchema} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import MarkdownIt from 'markdown-it';
import {MarkdownParser,MarkdownSerializer,defaultMarkdownSerializer as base} from 'prosemirror-markdown';
import * as Y from 'yjs';
import {prosemirrorJSONToYDoc,prosemirrorToYXmlFragment,yXmlFragmentToProseMirrorRootNode} from '@tiptap/y-tiptap';

const schema=getSchema([StarterKit.configure({undoRedo:false}),Mention.extend({addAttributes(){return {...this.parent?.(),kind:{default:'agent'},mentionId:{default:null}}}})]);
const md=new MarkdownIt('commonmark',{html:false});
// Trial-only identity syntax. Production syntax remains a product decision.
md.inline.ruler.before('link','identity',(state,silent)=>{
 const m=/^\[@[^\]]*\]\(colab-mention:([A-Za-z0-9_-]+)\)/.exec(state.src.slice(state.pos));
 if(!m)return false;
 if(!silent){const token=state.push('identity','',0);token.meta=JSON.parse(Buffer.from(m[1],'base64url').toString());}
 state.pos+=m[0].length;return true;
});
const parser=new MarkdownParser(schema,md,{
 paragraph:{block:'paragraph'},blockquote:{block:'blockquote'},heading:{block:'heading',getAttrs:t=>({level:+t.tag.slice(1)})},
 bullet_list:{block:'bulletList'},ordered_list:{block:'orderedList',getAttrs:t=>({start:+t.attrGet('start')||1})},list_item:{block:'listItem'},
 fence:{block:'codeBlock',getAttrs:t=>({language:t.info||null}),noCloseToken:true},code_block:{block:'codeBlock',noCloseToken:true},
 hr:{node:'horizontalRule'},hardbreak:{node:'hardBreak'},identity:{node:'mention',getAttrs:t=>t.meta},
 strong:{mark:'bold'},em:{mark:'italic'},code_inline:{mark:'code',noCloseToken:true},link:{mark:'link',getAttrs:t=>({href:t.attrGet('href'),title:t.attrGet('title')||null})},
});
const serializer=new MarkdownSerializer({
 ...base.nodes,
 bulletList:base.nodes.bullet_list,listItem:base.nodes.list_item,horizontalRule:base.nodes.horizontal_rule,hardBreak:base.nodes.hard_break,
 orderedList:(s,n)=>s.renderList(n,'  ',i=>`${n.attrs.start+i}. `),
 codeBlock:(s,n)=>base.nodes.code_block(s,{...n,attrs:{params:n.attrs.language},textContent:n.textContent}),
 mention:(s,n)=>s.text(`[@${n.attrs.label}](colab-mention:${Buffer.from(JSON.stringify(n.attrs)).toString('base64url')})`,false),
},{...base.marks,bold:base.marks.strong,italic:base.marks.em},{hardBreakNodeName:'hardBreak'});
const text=(t,marks)=>({type:'text',text:t,...(marks?{marks}:{} )});
const p=(...content)=>({type:'paragraph',content});
const doc=(...content)=>schema.nodeFromJSON({type:'doc',content});
const mention={type:'mention',attrs:{id:'agent-uuid',label:'Runtime Validation Agent',kind:'agent',mentionId:'occurrence-1'}};
const cases=[
 ['heading-paragraph',doc({type:'heading',attrs:{level:1},content:[text('Heading')]},p(text('Body')))],
 ['marks',doc(p(text('bold',[{type:'bold'}]),text(' '),text('italic',[{type:'italic'}]),text(' '),text('code',[{type:'code'}])))],
 ['hard-break',doc(p(text('first'),{type:'hardBreak'},text('second')))],
 ['nested-list',doc({type:'bulletList',content:[{type:'listItem',content:[p(text('one')),{type:'orderedList',attrs:{start:3},content:[{type:'listItem',content:[p(text('nested'))]}]}]}]})],
 ['quote',doc({type:'blockquote',content:[p(text('quote')),p(text('second'))]})],
 ['code-fences',doc({type:'codeBlock',attrs:{language:'python'},content:[text('print("```你好")\n')]} )],
 ['agent-and-user',doc(p(text('Task '),mention,text(' and '),{...mention,attrs:{...mention.attrs,id:'user-uuid',kind:'member',mentionId:'occurrence-2'}}))],
 ['same-label-different-id',doc(p(mention,text(' '),{...mention,attrs:{...mention.attrs,id:'other-agent',mentionId:'occurrence-3'}}))],
 ['component-fence',doc({type:'codeBlock',attrs:{language:'colab-component'},content:[text(':::colab-component{type="queryList" id="query_01"}\nSummary\n:::')]} )],
 ['empty-paragraphs',doc(p(text('first')),p(),p(),p(text('last')))],
 ['mark-edge-whitespace',doc(p(text(' bold ',[{type:'bold'}])))],
 ['strike',doc(p(text('removed',[{type:'strike'}])))],
 ['link-attributes',doc(p(text('link',[{type:'link',attrs:{href:'https://example.com',target:'_self',rel:'author',class:'custom'}}])))],
 ['heading-hard-break',doc({type:'heading',attrs:{level:1},content:[text('first'),{type:'hardBreak'},text('second')]} )],
];
const results=[];
for(const [name,input] of cases){
 try{const projection=serializer.serialize(input),output=parser.parse(projection);results.push({name,exactTree:input.eq(output),projection,...(!input.eq(output)?{before:input.toJSON(),after:output.toJSON()}: {})});}
 catch(e){results.push({name,exactTree:false,error:e.message});}
}
// Prove simple extension fixes independently, while retaining baseline losses.
const extendedMd=new MarkdownIt('commonmark',{html:false}).enable('strikethrough');
const extendedParser=new MarkdownParser(schema,extendedMd,{...parser.tokens,s:{mark:'strike'}});
const extendedSerializer=new MarkdownSerializer({...serializer.nodes},{...serializer.marks,strike:{open:'~~',close:'~~',mixable:true}},{hardBreakNodeName:'hardBreak'});
const strike=cases.find(([name])=>name==='strike')[1];
assert(strike.eq(extendedParser.parse(extendedSerializer.serialize(strike))));
const plainMention=parser.parse('Task @Runtime Validation Agent');
assert.equal(plainMention.firstChild.childCount,1);
assert.equal(plainMention.firstChild.firstChild.type.name,'text');
// Existing fragment reconciliation: preserve identity, append beside a mention,
// then merge independent remote text edit with the captured incremental update.
const source=doc(p(text('request '),mention),p(text('other')));
const a=prosemirrorJSONToYDoc(schema,source.toJSON(),'default');
const b=new Y.Doc();Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
const sv=Y.encodeStateVector(a);
const target=doc(p(text('request '),mention),p(text('appended response')),p(text('other')));
const originalMention=a.getXmlFragment('default').get(0).get(1);
prosemirrorToYXmlFragment(target,a.getXmlFragment('default'));
assert.equal(a.getXmlFragment('default').get(0).get(1),originalMention);
b.getXmlFragment('default').get(1).get(0).insert(5,' remote');
const da=Y.encodeStateAsUpdate(a,sv),db=Y.encodeStateAsUpdate(b,sv);
Y.applyUpdate(a,db);Y.applyUpdate(b,da);Y.applyUpdate(b,da);
assert.deepEqual(yXmlFragmentToProseMirrorRootNode(a.getXmlFragment('default'),schema).toJSON(),yXmlFragmentToProseMirrorRootNode(b.getXmlFragment('default'),schema).toJSON());
const merged=yXmlFragmentToProseMirrorRootNode(a.getXmlFragment('default'),schema);
assert.equal(merged.child(1).textContent,'appended response');assert.equal(merged.child(2).textContent,'other remote');
const report={versions:{tiptap:'3.31.4',markdown:'1.13.2',binding:'3.0.9',yjs:'13.6.27'},results,extensions:{strikeRoundtrip:true,plainAtLabelLosesIdentity:true},incremental:{mentionIdentityPreserved:true,appendAndConcurrentOtherParagraphEdit:true,duplicateUpdate:true},limits:['No source-map patch mapper implemented in this trial','No same-range stale patch conflict protection proved','No real query component node exists in current GUI; only current fence representation tested','No production Rust/JS integration or installed-app acceptance performed']};
fs.writeFileSync('results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({results:results.map(({name,exactTree,error})=>({name,exactTree,error})),incremental:report.incremental,limits:report.limits},null,2));
