import Image from '@tiptap/extension-image';
import {getSchema} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import MarkdownIt from 'markdown-it';
import {MarkdownParser,MarkdownSerializer,defaultMarkdownSerializer as base} from 'prosemirror-markdown';
import * as Y from 'yjs';
import {prosemirrorToYXmlFragment,yXmlFragmentToProseMirrorRootNode} from '@tiptap/y-tiptap';

export const schema=getSchema([Image.extend({addAttributes(){return {...this.parent?.(),attachmentId:{default:null}}}}),StarterKit.configure({undoRedo:false}),Mention.extend({addAttributes(){return {...this.parent?.(),kind:{default:'agent'},mentionId:{default:null}}}})]);
const md=new MarkdownIt('commonmark',{html:false}).enable('strikethrough');
// CommonMark omits a terminal hard break. A conventional explicit <br> keeps it
// representable without enabling arbitrary HTML in the document parser.
md.inline.ruler.before('html_inline','explicit_break',(state,silent)=>{
 const m=/^<br\s*\/?\s*>/.exec(state.src.slice(state.pos));if(!m)return false;
 if(!silent)state.push('hardbreak','br',0);state.pos+=m[0].length;return true;
});
md.inline.ruler.before('link','identity',(state,silent)=>{
 const m=/^\[@[^\]]*\]\(colab-(?:mention:|resource:(files|session|canvas|message):([A-Za-z0-9-]+):)([A-Za-z0-9_-]+)\)/.exec(state.src.slice(state.pos));
 if(!m)return false;
 const attrs=JSON.parse(Buffer.from(m[3],'base64url').toString());
 if(m[1]&&(attrs.kind!==m[1]||attrs.id!==m[2]))throw Error('protected_content_changed: resource handle does not match its identity');
 if(!silent){const t=state.push('identity','',0);t.meta=attrs;}
 state.pos+=m[0].length;return true;
});
// Stored images are block nodes; unwrap Markdown's standalone image paragraph.
md.core.ruler.after('inline','canvas_images',state=>{
 for(let i=0;i<state.tokens.length-2;i++){
  const [open,inline,close]=state.tokens.slice(i,i+3);
  if(open.type==='paragraph_open'&&inline.type==='inline'&&close.type==='paragraph_close'&&inline.children?.length===1&&inline.children[0].type==='image'){
   state.tokens.splice(i,3,inline.children[0]);
  }
 }
});
export const parser=new MarkdownParser(schema,md,{
 paragraph:{block:'paragraph'},blockquote:{block:'blockquote'},heading:{block:'heading',getAttrs:t=>({level:+t.tag.slice(1)})},
 bullet_list:{block:'bulletList'},ordered_list:{block:'orderedList',getAttrs:t=>({start:+t.attrGet('start')||1})},list_item:{block:'listItem'},
 fence:{block:'codeBlock',getAttrs:t=>({language:t.info||null}),noCloseToken:true},code_block:{block:'codeBlock',noCloseToken:true},
 image:{node:'image',getAttrs:t=>{const src=t.attrGet('src');if(!/^colab-image:[0-9a-f-]{36}$/.test(src))throw Error('invalid_image_handle');const attrs=t.attrGet('title')?JSON.parse(Buffer.from(t.attrGet('title'),'base64url').toString()):{};return {...attrs,attachmentId:src.slice(12),src:`/v1/canvas-images/${src.slice(12)}/content`,alt:t.content||null};}},
 hr:{node:'horizontalRule'},hardbreak:{node:'hardBreak'},identity:{node:'mention',getAttrs:t=>t.meta},
 strong:{mark:'bold'},em:{mark:'italic'},s:{mark:'strike'},code_inline:{mark:'code',noCloseToken:true},link:{mark:'link',getAttrs:t=>({href:t.attrGet('href'),title:t.attrGet('title')||null})},
});
export const serializer=new MarkdownSerializer({
 ...base.nodes,image:(s,n)=>{const {src,attachmentId,alt,...attrs}=n.attrs;if(!attachmentId)throw Error('invalid_image_handle');s.write(`![${String(alt??'').replace(/[\[\]]/g,'')}](colab-image:${attachmentId} "${Buffer.from(JSON.stringify(attrs)).toString('base64url')}")`);s.closeBlock(n);},bulletList:base.nodes.bullet_list,listItem:base.nodes.list_item,horizontalRule:base.nodes.horizontal_rule,
 hardBreak:(s,n,parent,index)=>{if(index===parent.childCount-1)s.write('<br>');else base.nodes.hard_break(s,n,parent,index);},
 orderedList:(s,n)=>s.renderList(n,'  ',i=>`${n.attrs.start+i}. `),
 codeBlock:(s,n)=>base.nodes.code_block(s,{...n,attrs:{params:n.attrs.language},textContent:n.textContent}),
 mention:(s,n)=>s.text(`[@${String(n.attrs.label??n.attrs.id).replace(/[\[\]]/g,'')}](colab-${['files','session','canvas','message'].includes(n.attrs.kind)?`resource:${n.attrs.kind}:${n.attrs.id}:`:'mention:'}${Buffer.from(JSON.stringify(n.attrs)).toString('base64url')})`,false),
},{...base.marks,bold:base.marks.strong,italic:base.marks.em,strike:{open:'~~',close:'~~',mixable:true}},{hardBreakNodeName:'hardBreak'});

function blockMarkdown(node){return serializer.serialize(schema.nodes.doc.create(null,node));}
function parts(node){const out=[];node.forEach(n=>out.push(blockMarkdown(n)));return out;}
export function render(node){return parts(node).join('\n\n')+'\n';}
function protectedNodes(node){const out=[];node.descendants(n=>{if(n.type.name==='mention'||(n.type.name==='codeBlock'&&n.attrs.language==='colab-component'))out.push(JSON.stringify(n.toJSON()));});return out;}

// Preserve all unaffected root nodes, including attributes and empty paragraphs that plain
// Markdown cannot encode. Only the changed root range is reparsed, then reconciled by binding.
export function patch(node,oldText,newText){
 const chunks=parts(node),before=chunks.join('\n\n')+'\n';
 const at=before.indexOf(oldText);
 if(at<0)throw Error('patch_conflict: context not found');
 if(before.indexOf(oldText,at+1)>=0)throw Error('patch_conflict: ambiguous context');
 if(oldText===newText)return node;
 let commonStart=0;while(commonStart<oldText.length&&commonStart<newText.length&&oldText[commonStart]===newText[commonStart])commonStart++;
 let commonEnd=0;while(commonEnd<oldText.length-commonStart&&commonEnd<newText.length-commonStart&&oldText.at(-1-commonEnd)===newText.at(-1-commonEnd))commonEnd++;
 const start=at+commonStart,end=at+oldText.length-commonEnd;
 const replacement=newText.slice(commonStart,newText.length-commonEnd);
 let offset=0,lo=-1,hi=-1,rangeStart=0,rangeEnd=0;
 for(let i=0;i<chunks.length;i++){
  const stop=offset+chunks[i].length;
  if(lo<0&&start<=stop){lo=i;rangeStart=offset;}
  if(lo>=0&&end<=stop){hi=i;rangeEnd=stop;break;}
  offset=stop+2;
 }
 if(lo<0||hi<0)throw Error('patch_conflict: unsupported document boundary');
 const nodes=[];for(let i=lo;i<=hi;i++)nodes.push(node.child(i));
 const affected=schema.nodes.doc.create(null,nodes);
 // A lossy baseline cannot safely be reparsed. Fail before any Yjs mutation.
 if(!parser.parse(render(affected)).eq(affected))throw Error('projection_not_representable: affected region cannot round-trip safely');
 const fragment=before.slice(rangeStart,start)+replacement+before.slice(end,rangeEnd);
 const parsed=parser.parse(fragment);
 if(JSON.stringify(protectedNodes(affected))!==JSON.stringify(protectedNodes(parsed)))throw Error('protected_content_changed: mention identities and component fences must be preserved');
 const result=[];for(let i=0;i<lo;i++)result.push(node.child(i));parsed.forEach(n=>result.push(n));for(let i=hi+1;i<node.childCount;i++)result.push(node.child(i));
 const next=schema.nodes.doc.createChecked(null,result);
 return next;
}
export function run(input){
 const doc=new Y.Doc();Y.applyUpdate(doc,Buffer.from(input.state,'base64'));
 if(doc.store.pendingStructs || doc.store.pendingDs)throw Error('canvas_sync_incomplete: document dependencies are missing');
 const root=doc.getXmlFragment('default');const node=yXmlFragmentToProseMirrorRootNode(root,schema);
 if(input.operation==='render')return {content:render(node)};
 const next=patch(node,input.old,input.new),vector=Y.encodeStateVector(doc);
 prosemirrorToYXmlFragment(next,root);
 const actual=yXmlFragmentToProseMirrorRootNode(root,schema);
 if(!actual.eq(next))throw Error('codec_postcondition_failed');
 return {content:render(actual),update:Buffer.from(Y.encodeStateAsUpdate(doc,vector)).toString('base64')};
}
